import type { Candidate } from '@talent-scout/shared';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface RunStats {
  total_candidates: number;
  identified_chinese: number;
  evaluated: number;
  reach_out: number;
  monitor: number;
  skip: number;
  avg_skill_score: number;
  avg_ai_depth_score: number;
  run_at: string;
}

/** Compute summary statistics from evaluated candidates. */
export function computeRunStats(candidates: Candidate[], minConfidence = 0.5): RunStats {
  const identified = candidates.filter(
    (candidate) => (candidate.identity?.china_confidence ?? 0) >= minConfidence
  );
  const evaluated = candidates.filter((c) => c.evaluation);

  let skillSum = 0;
  let aiDepthSum = 0;
  let reachOut = 0;
  let monitor = 0;
  let skip = 0;

  for (const c of evaluated) {
    const ev = c.evaluation;
    if (!ev) continue;
    skillSum += ev.skill_score;
    aiDepthSum += ev.ai_depth_score;
    switch (ev.recommended_action) {
      case 'reach_out':
        reachOut++;
        break;
      case 'monitor':
        monitor++;
        break;
      case 'skip':
        skip++;
        break;
    }
  }

  const n = evaluated.length || 1;
  return {
    total_candidates: candidates.length,
    identified_chinese: identified.length,
    evaluated: evaluated.length,
    reach_out: reachOut,
    monitor,
    skip,
    avg_skill_score: Math.round((skillSum / n) * 100) / 100,
    avg_ai_depth_score: Math.round((aiDepthSum / n) * 100) / 100,
    run_at: new Date().toISOString(),
  };
}

/** Format run stats as a Markdown section to append to SKILLS-pending.md. */
export function formatStatsEntry(stats: RunStats): string {
  return [
    `## Run ${stats.run_at}`,
    '',
    `- Total candidates: ${String(stats.total_candidates)}`,
    `- Identified Chinese: ${String(stats.identified_chinese)}`,
    `- Evaluated: ${String(stats.evaluated)}`,
    `- Reach out: ${String(stats.reach_out)}, Monitor: ${String(stats.monitor)}, Skip: ${String(stats.skip)}`,
    `- Avg skill score: ${String(stats.avg_skill_score)}, Avg AI depth: ${String(stats.avg_ai_depth_score)}`,
    '',
  ].join('\n');
}

const SKILLS_PENDING = 'SKILLS-pending.md';
const STATS_JSON = 'stats.json';

/** Append run stats to the SKILLS-pending.md file in the given directory. */
export async function appendSkillsPending(dir: string, stats: RunStats): Promise<void> {
  const pendingPath = join(dir, SKILLS_PENDING);
  const entry = formatStatsEntry(stats);

  let existing = '';
  try {
    existing = await readFile(pendingPath, 'utf-8');
  } catch {
    // File doesn't exist yet — start fresh
  }

  const header = existing ? '' : '# SKILLS Pending Updates\n\n';
  await writeFile(pendingPath, `${existing}${header}${entry}`, 'utf-8');
}

/** Load historical run stats from stats.json. */
export async function loadStatsHistory(dir: string): Promise<RunStats[]> {
  try {
    const raw = await readFile(join(dir, STATS_JSON), 'utf-8');
    return JSON.parse(raw) as RunStats[];
  } catch {
    return [];
  }
}

/** Append run stats to stats.json (accumulative array). */
export async function writeStatsJson(dir: string, stats: RunStats): Promise<void> {
  const history = await loadStatsHistory(dir);
  history.push(stats);
  await writeFile(join(dir, STATS_JSON), JSON.stringify(history, null, 2) + '\n');
}
