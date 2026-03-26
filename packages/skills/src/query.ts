import type { RunStats } from '@talent-scout/ai-evaluator';
import type { Candidate, TalentEntry } from '@talent-scout/shared';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Resolve the latest evaluated output directory. */
function resolveOutputDir(): string {
  return process.env['TALENT_OUTPUT_DIR'] ?? resolve('output', 'evaluated', 'latest');
}

/** Load the shortlist from the latest evaluation. */
export async function queryShortlist(): Promise<TalentEntry[]> {
  const dir = resolveOutputDir();
  const raw = await readFile(join(dir, 'shortlist.json'), 'utf-8');
  return JSON.parse(raw) as TalentEntry[];
}

/** Load a specific candidate from the latest evaluation. */
export async function queryCandidate(username: string): Promise<Candidate | null> {
  const dir = resolveOutputDir();
  const raw = await readFile(join(dir, 'evaluation.json'), 'utf-8');
  const data = JSON.parse(raw) as Record<string, Candidate>;
  return data[username] ?? null;
}

/** Load run stats from the latest evaluation. */
export async function queryStats(): Promise<RunStats> {
  const dir = resolveOutputDir();
  try {
    const raw = await readFile(join(dir, 'stats.json'), 'utf-8');
    return JSON.parse(raw) as RunStats;
  } catch {
    // If stats.json doesn't exist yet, compute from evaluation
    const evalRaw = await readFile(join(dir, 'evaluation.json'), 'utf-8');
    const data = JSON.parse(evalRaw) as Record<string, Candidate>;
    const { computeRunStats } = await import('@talent-scout/ai-evaluator');
    return computeRunStats(Object.values(data));
  }
}
