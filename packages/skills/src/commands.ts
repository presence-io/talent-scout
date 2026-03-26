import { resolve, join } from 'node:path';
import { readFile, readdir, mkdir, writeFile, symlink, rm, rename } from 'node:fs/promises';

import { loadConfig, readIgnoreList, isIgnored } from '@talent-scout/shared';
import type { Candidate, Signal } from '@talent-scout/shared';
import { runCollect } from '@talent-scout/data-collector';
import {
  mergeCandidateRecords,
  identifyCandidate,
  evaluateCandidate,
} from '@talent-scout/data-processor';
import { runPipeline } from '@talent-scout/ai-evaluator';

/** Run data collection via data-collector. */
export async function runCollectCommand(): Promise<void> {
  console.log('[skills] Running data collection...');
  await runCollect();
}

interface RawCollectionFile {
  candidates: Record<string, Signal[]>;
}

/** Run data processing (merge → identity → scoring). */
export async function runProcessCommand(): Promise<void> {
  console.log('[skills] Running data processing...');
  const baseDir = process.cwd();
  const config = await loadConfig();
  const ignoreList = await readIgnoreList(join(baseDir, 'user-data', 'ignore-list.json'));

  // Find latest raw dir
  const rawBase = join(baseDir, 'output', 'raw');
  const entries = await readdir(rawBase, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();
  if (dirs.length === 0) throw new Error(`No raw data directories found in ${rawBase}`);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const rawDir = join(rawBase, dirs[0]!);

  // Load and merge signals
  const files = await readdir(rawDir);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));
  const rawSignals: Record<string, Signal[]> = {};
  for (const file of jsonFiles) {
    const raw = await readFile(join(rawDir, file), 'utf-8');
    const data = JSON.parse(raw) as RawCollectionFile;
    for (const [username, signals] of Object.entries(data.candidates)) {
      const existing = rawSignals[username] ?? [];
      existing.push(...signals);
      rawSignals[username] = existing;
    }
  }

  // Merge, identify, score
  const candidateMap = mergeCandidateRecords(rawSignals);
  const candidates: Candidate[] = [];
  for (const [username, candidate] of candidateMap) {
    if (!isIgnored(ignoreList, username)) candidates.push(candidate);
  }
  for (const c of candidates) c.identity = identifyCandidate(c);
  const identified = candidates.filter((c) => (c.identity?.china_confidence ?? 0) >= 0.5);
  for (const c of identified) c.evaluation = evaluateCandidate(c, config);

  // Write output
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const outputDir = resolve(baseDir, 'output', 'processed', timestamp);
  await mkdir(outputDir, { recursive: true });

  const mergedOutput: Record<string, Candidate> = {};
  for (const c of candidates) mergedOutput[c.username] = c;
  await writeJsonAtomic(join(outputDir, 'merged.json'), mergedOutput);

  const identityOutput: Record<string, Candidate['identity']> = {};
  for (const c of candidates) {
    if (c.identity) identityOutput[c.username] = c.identity;
  }
  await writeJsonAtomic(join(outputDir, 'identity.json'), identityOutput);

  const scoredOutput: Record<string, Candidate> = {};
  for (const c of identified) scoredOutput[c.username] = c;
  await writeJsonAtomic(join(outputDir, 'scored.json'), scoredOutput);

  const latestLink = resolve(baseDir, 'output', 'processed', 'latest');
  try {
    await rm(latestLink, { force: true });
  } catch {
    /* ignore */
  }
  await symlink(outputDir, latestLink);

  console.log(`[skills] Processed ${String(candidates.length)} candidates → ${outputDir}`);
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const tmpPath = filePath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(data, null, 2));
  await rename(tmpPath, filePath);
}

/** Run AI evaluation via ai-evaluator. */
export async function runEvaluateCommand(): Promise<void> {
  console.log('[skills] Running AI evaluation...');
  const baseDir = process.cwd();
  const inputDir = resolve(baseDir, 'output', 'processed', 'latest');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const outputDir = resolve(baseDir, 'output', 'evaluated', timestamp);
  await mkdir(outputDir, { recursive: true });

  await runPipeline({
    inputDir,
    outputDir,
    ignoreListPath: join(baseDir, 'user-data', 'ignore-list.json'),
    skipAI: process.argv.includes('--skip-ai'),
  });

  const latestLink = join(baseDir, 'output', 'evaluated', 'latest');
  try {
    await rm(latestLink);
  } catch {
    /* ignore */
  }
  await symlink(timestamp, latestLink);
}
