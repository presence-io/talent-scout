import type { Candidate, TalentEntry } from '@talent-scout/shared';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { RunStats } from './skills.js';
import { computeRunStats } from './skills.js';

/** Load the shortlist from a given output directory. */
export async function loadShortlist(outputDir: string): Promise<TalentEntry[]> {
  const raw = await readFile(join(outputDir, 'shortlist.json'), 'utf-8');
  return JSON.parse(raw) as TalentEntry[];
}

/** Load the full evaluation map from a given output directory. */
export async function loadEvaluation(outputDir: string): Promise<Record<string, Candidate>> {
  const raw = await readFile(join(outputDir, 'evaluation.json'), 'utf-8');
  return JSON.parse(raw) as Record<string, Candidate>;
}

/** Load or compute run stats from a given output directory. */
export async function loadRunStats(outputDir: string): Promise<RunStats> {
  try {
    const raw = await readFile(join(outputDir, 'stats.json'), 'utf-8');
    return JSON.parse(raw) as RunStats;
  } catch {
    // stats.json may not exist; compute from evaluation.json
    const evaluation = await loadEvaluation(outputDir);
    return computeRunStats(Object.values(evaluation));
  }
}
