import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { type Signal, FileCache, loadConfig } from '@talent-scout/shared';

import { collectCommunitySignals } from './community.js';
import { collectFollowerGraphSignals } from './follower-graph.js';
import { collectAllGitHubSignals } from './github-signals.js';
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

/** Run the full data collection pipeline */
export async function runCollect(): Promise<void> {
  const config = await loadConfig();
  const cache = new FileCache(resolve('cache/github'));

  const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const outputDir = resolve(`output/raw/${timestamp}`);
  await mkdir(outputDir, { recursive: true });

  // Collect from all sources
  console.log('Collecting GitHub signals...');
  const githubSignals = await collectAllGitHubSignals(cache);

  console.log('Collecting community signals...');
  const communitySignals = await collectCommunitySignals(config, cache);

  console.log('Collecting stargazer signals...');
  const stargazerSignals = await collectStargazerSignals(config, cache);

  // Merge all signals
  const allSignals = mergeSignalMaps(githubSignals, communitySignals, stargazerSignals);

  // Save raw outputs
  await saveSignalMap(join(outputDir, 'github-signals.json'), githubSignals, 'github-signals');
  await saveSignalMap(join(outputDir, 'community.json'), communitySignals, 'community');
  await saveSignalMap(join(outputDir, 'stargazers.json'), stargazerSignals, 'stargazers');

  console.log(`Total: ${String(allSignals.size)} unique users from initial collection`);

  // Follower graph expansion is done later after identity pass
  await writeJsonAtomic(join(outputDir, 'follower-graph.json'), {
    step: 'follower-graph',
    collected_at: new Date().toISOString(),
    note: 'Run after identity pass with seed users',
    user_count: 0,
    candidates: {},
  });

  console.log(`Raw data saved to ${outputDir}`);
}

/** Run follower graph expansion (separate step, after identity pass) */
export async function runGraphExpansion(seedUsers: string[]): Promise<Map<string, Signal[]>> {
  const config = await loadConfig();
  const cache = new FileCache(resolve('cache/github'));
  return collectFollowerGraphSignals(config, cache, seedUsers);
}

async function saveSignalMap(
  filePath: string,
  signals: Map<string, Signal[]>,
  step: string,
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
