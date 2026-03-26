import { isIgnored, loadConfig, readIgnoreList } from '@talent-scout/shared';
import type { Candidate, Signal } from '@talent-scout/shared';
import { mkdir, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { identifyCandidate } from './identity.js';
import { mergeCandidateRecords } from './merge.js';
import { evaluateCandidate } from './scoring.js';

interface RawCollectionFile {
  candidates: Record<string, Signal[]>;
}

/** Find the latest raw collection directory */
async function findLatestRawDir(baseDir: string): Promise<string> {
  const rawDir = join(baseDir, 'output', 'raw');
  const entries = await readdir(rawDir, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();
  if (dirs.length === 0) {
    throw new Error(`No raw data directories found in ${rawDir}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return join(rawDir, dirs[0]!);
}

/** Load and merge all raw signal files from a directory */
async function loadRawSignals(rawDir: string): Promise<Record<string, Signal[]>> {
  const files = await readdir(rawDir);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  const records: Record<string, Signal[]>[] = [];
  for (const file of jsonFiles) {
    const raw = await readFile(join(rawDir, file), 'utf-8');
    const data = JSON.parse(raw) as RawCollectionFile;
    records.push(data.candidates);
  }

  // Merge all records into a single map
  const merged: Record<string, Signal[]> = {};
  for (const record of records) {
    for (const [username, signals] of Object.entries(record)) {
      const existing = merged[username] ?? [];
      existing.push(...signals);
      merged[username] = existing;
    }
  }
  return merged;
}

/** Run the full data processing pipeline */
async function runProcess(): Promise<void> {
  const baseDir = process.cwd();
  const config = await loadConfig();
  const ignoreList = await readIgnoreList(join(baseDir, 'user-data', 'ignore-list.json'));

  // Step 1: Find latest raw data
  const rawDir = await findLatestRawDir(baseDir);
  console.log(`Reading raw data from ${rawDir}`);

  // Step 2: Load and merge signals
  const rawSignals = await loadRawSignals(rawDir);
  console.log(`Loaded signals for ${String(Object.keys(rawSignals).length)} users`);

  // Step 3: Merge and deduplicate
  const candidateMap = mergeCandidateRecords(rawSignals);
  console.log(`Merged into ${String(candidateMap.size)} candidates`);

  // Step 4: Filter out ignored users
  const candidates: Candidate[] = [];
  for (const [username, candidate] of candidateMap) {
    if (isIgnored(ignoreList, username)) {
      continue;
    }
    candidates.push(candidate);
  }
  console.log(`After ignore filter: ${String(candidates.length)} candidates`);

  // Step 5: Identity detection
  for (const c of candidates) {
    c.identity = identifyCandidate(c);
  }
  const identified = candidates.filter((c) => (c.identity?.china_confidence ?? 0) >= 0.5);
  console.log(`Identified Chinese developers: ${String(identified.length)}`);

  // Step 6: Rule-based evaluation
  for (const c of identified) {
    c.evaluation = evaluateCandidate(c, config);
  }

  // Step 7: Write output
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const outputDir = resolve(baseDir, 'output', 'processed', timestamp);
  await mkdir(outputDir, { recursive: true });

  // Write merged candidates
  const mergedOutput: Record<string, Candidate> = {};
  for (const c of candidates) {
    mergedOutput[c.username] = c;
  }
  await writeJsonAtomic(join(outputDir, 'merged.json'), mergedOutput);

  // Write identity results
  const identityOutput: Record<string, Candidate['identity']> = {};
  for (const c of candidates) {
    if (c.identity) {
      identityOutput[c.username] = c.identity;
    }
  }
  await writeJsonAtomic(join(outputDir, 'identity.json'), identityOutput);

  // Write scored results
  const scoredOutput: Record<string, Candidate> = {};
  for (const c of identified) {
    scoredOutput[c.username] = c;
  }
  await writeJsonAtomic(join(outputDir, 'scored.json'), scoredOutput);

  // Update latest symlink
  const latestLink = resolve(baseDir, 'output', 'processed', 'latest');
  try {
    await rm(latestLink, { force: true });
  } catch {
    // Ignore if not exists
  }
  await symlink(outputDir, latestLink);

  console.log(`Processed data saved to ${outputDir}`);
  console.log(`Evaluated: ${String(identified.length)} / ${String(candidates.length)} candidates`);
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const tmpPath = filePath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(data, null, 2));
  await rename(tmpPath, filePath);
}

runProcess().catch((err: unknown) => {
  console.error('Processing failed:', err);
  process.exit(1);
});
