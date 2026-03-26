import type { RunStats } from '@talent-scout/ai-evaluator';
import { loadEvaluation, loadRunStats, loadShortlist } from '@talent-scout/ai-evaluator';
import type { Candidate, TalentEntry } from '@talent-scout/shared';
import { resolveOutputDir } from '@talent-scout/shared';
import { resolve } from 'node:path';

/** Resolve the latest evaluated output directory. */
function resolveEvaluatedDir(): string {
  return process.env['TALENT_OUTPUT_DIR'] ?? resolve(resolveOutputDir(), 'evaluated', 'latest');
}

/** Load the shortlist from the latest evaluation. */
export async function queryShortlist(): Promise<TalentEntry[]> {
  return loadShortlist(resolveEvaluatedDir());
}

/** Load a specific candidate from the latest evaluation. */
export async function queryCandidate(username: string): Promise<Candidate | null> {
  const data = await loadEvaluation(resolveEvaluatedDir());
  return data[username] ?? null;
}

/** Load run stats from the latest evaluation. */
export async function queryStats(): Promise<RunStats> {
  return loadRunStats(resolveEvaluatedDir());
}
