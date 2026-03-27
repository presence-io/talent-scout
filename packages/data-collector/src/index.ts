import {
  FileCache,
  type Signal,
  findOrCreateRunDir,
  loadConfig,
  resolveCacheDir,
  resolveOutputDir,
} from '@talent-scout/shared';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { collectCommunitySignals } from './community.js';
import { collectFollowerGraphSignals } from './follower-graph.js';
import { collectAllGitHubSignals } from './github-signals.js';
import { collectRankingSignals } from './rankings.js';
import { collectStargazerSignals } from './stargazers.js';

export { loadRawSignals } from './query.js';

/** Merge signal maps into a single map */
function mergeSignalMaps(...maps: Map<string, Signal[]>[]): Map<string, Signal[]> {
  const merged = new Map<string, Signal[]>();
  for (const map of maps) {
    for (const [username, signals] of map) {
      const existing = merged.get(username) ?? [];
      existing.push(...signals);
      merged.set(username, existing);
    }
  }
  return merged;
}

/**
 * Run or resume a collector. If the output file already exists, skip the
 * collector and load from disk instead. Otherwise run and save immediately.
 */
async function collectOrLoad(
  filePath: string,
  label: string,
  collector: () => Promise<Map<string, Signal[]>>
): Promise<Map<string, Signal[]>> {
  const step = basename(filePath, '.json');

  if (existsSync(filePath)) {
    console.log(`Resuming: loading existing ${label} from ${step}.json`);
    const raw = await readFile(filePath, 'utf-8');
    const data = JSON.parse(raw) as { candidates: Record<string, Signal[]> };
    return new Map(Object.entries(data.candidates));
  }

  console.log(`Collecting ${label}...`);
  const result = await collector();
  await saveSignalMap(filePath, result, step);
  return result;
}

/** Run the full data collection pipeline with resume support. */
export async function runCollect(): Promise<void> {
  const config = await loadConfig();
  console.log('    ✓ Config loaded');
  const cache = new FileCache(resolve(resolveCacheDir(), 'github'));
  console.log('    ✓ Cache initialized');

  const rawBase = resolve(resolveOutputDir(), 'raw');
  const outputDir = await findOrCreateRunDir(rawBase);
  console.log(`    📁 Output directory: ${outputDir}`);

  // Each collector saves immediately on completion. On resume, completed
  // collectors are loaded from disk; only the interrupted one re-runs
  // (individual API pages are also cached by ghApi).
  console.log('\n    [1/4] Collecting GitHub signals (code search, commits, topics)...');
  const t1 = Date.now();
  const githubSignals = await collectOrLoad(
    join(outputDir, 'github-signals.json'),
    'GitHub signals',
    () => collectAllGitHubSignals(cache)
  );
  console.log(`    ✓ GitHub signals: ${String(githubSignals.size)} users (${((Date.now() - t1) / 1000).toFixed(1)}s)`);

  console.log('\n    [2/4] Collecting community signals (stargazers, contributors, forks)...');
  const t2 = Date.now();
  const communitySignals = await collectOrLoad(
    join(outputDir, 'community.json'),
    'community signals',
    () => collectCommunitySignals(config, cache)
  );
  console.log(`    ✓ Community signals: ${String(communitySignals.size)} users (${((Date.now() - t2) / 1000).toFixed(1)}s)`);

  console.log('\n    [3/4] Collecting stargazer signals...');
  const t3 = Date.now();
  const stargazerSignals = await collectOrLoad(
    join(outputDir, 'stargazers.json'),
    'stargazer signals',
    () => collectStargazerSignals(config, cache)
  );
  console.log(`    ✓ Stargazer signals: ${String(stargazerSignals.size)} users (${((Date.now() - t3) / 1000).toFixed(1)}s)`);

  console.log('\n    [4/4] Collecting ranking/seed signals...');
  const t4 = Date.now();
  const rankingSignals = await collectOrLoad(
    join(outputDir, 'rankings.json'),
    'ranking/seed signals',
    () => collectRankingSignals(config, cache)
  );
  console.log(`    ✓ Ranking signals: ${String(rankingSignals.size)} users (${((Date.now() - t4) / 1000).toFixed(1)}s)`);

  // Merge all signals
  console.log('\n    Merging all signal sources...');
  const allSignals = mergeSignalMaps(
    githubSignals,
    communitySignals,
    stargazerSignals,
    rankingSignals
  );
  console.log(`    ✓ Merged: ${String(allSignals.size)} unique users from initial collection`);

  // Follower graph expansion placeholder
  if (!existsSync(join(outputDir, 'follower-graph.json'))) {
    await writeJsonAtomic(join(outputDir, 'follower-graph.json'), {
      step: 'follower-graph',
      collected_at: new Date().toISOString(),
      note: 'Run after identity pass with seed users',
      user_count: 0,
      candidates: {},
    });
  }

  // Mark run complete so future runs create a new directory
  await writeFile(join(outputDir, '.complete'), new Date().toISOString());
  console.log(`Raw data saved to ${outputDir}`);
}

/** Run follower graph expansion (separate step, after identity pass) */
export async function runGraphExpansion(seedUsers: string[]): Promise<Map<string, Signal[]>> {
  const config = await loadConfig();
  const cache = new FileCache(resolve(resolveCacheDir(), 'github'));
  return collectFollowerGraphSignals(config, cache, seedUsers);
}

async function saveSignalMap(
  filePath: string,
  signals: Map<string, Signal[]>,
  step: string
): Promise<void> {
  const candidates: Record<string, Signal[]> = {};
  for (const [username, sigs] of signals) {
    candidates[username] = sigs;
  }

  await writeJsonAtomic(filePath, {
    step,
    collected_at: new Date().toISOString(),
    user_count: signals.size,
    candidates,
  });
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const tmpPath = filePath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(data, null, 2));
  const { rename } = await import('node:fs/promises');
  await rename(tmpPath, filePath);
}

// CLI entry
const args = process.argv.slice(2);
if (args.includes('--collect') || args.includes('collect')) {
  runCollect().catch((err: unknown) => {
    console.error('Collection failed:', err);
    process.exit(1);
  });
}
