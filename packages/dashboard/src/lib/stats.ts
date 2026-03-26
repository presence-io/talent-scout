import type { RunStats } from '@talent-scout/ai-evaluator';
import type { TalentEntry } from '@talent-scout/shared';

export interface DistributionEntry {
  label: string;
  count: number;
  percentage: number;
}

export interface TrendPoint {
  run_at: string;
  total_candidates: number;
  identified_chinese: number;
  evaluated: number;
  reach_out: number;
  avg_skill_score: number;
  avg_ai_depth_score: number;
}

export interface HistoryTrends {
  points: TrendPoint[];
  delta: {
    total_candidates: number;
    identified_chinese: number;
    evaluated: number;
    reach_out: number;
    avg_skill_score: number;
    avg_ai_depth_score: number;
  } | null;
}

export function resolveHeadlineTotal(entries: TalentEntry[], history: RunStats[]): number {
  const latest = history.at(-1);
  return latest?.total_candidates ?? entries.length;
}

/** Compute trends from historical stats. Returns recent points and delta from last two runs. */
export function computeHistoryTrends(history: RunStats[], maxPoints = 20): HistoryTrends {
  const recent = history.slice(-maxPoints);
  const points: TrendPoint[] = recent.map((s) => ({
    run_at: s.run_at,
    total_candidates: s.total_candidates,
    identified_chinese: s.identified_chinese,
    evaluated: s.evaluated,
    reach_out: s.reach_out,
    avg_skill_score: s.avg_skill_score,
    avg_ai_depth_score: s.avg_ai_depth_score,
  }));

  let delta: HistoryTrends['delta'] = null;
  if (recent.length >= 2) {
    const prev = recent.at(-2) as RunStats;
    const curr = recent.at(-1) as RunStats;
    delta = {
      total_candidates: curr.total_candidates - prev.total_candidates,
      identified_chinese: curr.identified_chinese - prev.identified_chinese,
      evaluated: curr.evaluated - prev.evaluated,
      reach_out: curr.reach_out - prev.reach_out,
      avg_skill_score: Math.round((curr.avg_skill_score - prev.avg_skill_score) * 100) / 100,
      avg_ai_depth_score:
        Math.round((curr.avg_ai_depth_score - prev.avg_ai_depth_score) * 100) / 100,
    };
  }

  return { points, delta };
}

export function computeActionDistribution(entries: TalentEntry[]): DistributionEntry[] {
  const total = entries.length;
  if (total === 0) return [];
  const counts: Record<string, number> = {};
  for (const e of entries) {
    counts[e.recommended_action] = (counts[e.recommended_action] ?? 0) + 1;
  }
  return Object.entries(counts).map(([label, count]) => ({
    label,
    count,
    percentage: Math.round((count / total) * 100),
  }));
}

export function computeTierDistribution(entries: TalentEntry[]): DistributionEntry[] {
  const total = entries.length;
  if (total === 0) return [];
  const counts: Record<string, number> = {};
  for (const e of entries) {
    counts[e.ai_depth_tier] = (counts[e.ai_depth_tier] ?? 0) + 1;
  }
  return Object.entries(counts).map(([label, count]) => ({
    label,
    count,
    percentage: Math.round((count / total) * 100),
  }));
}

export function computeCityDistribution(
  entries: TalentEntry[],
  topN: number = 10
): DistributionEntry[] {
  const total = entries.length;
  if (total === 0) return [];
  const counts: Record<string, number> = {};
  for (const e of entries) {
    const city = e.city ?? 'Unknown';
    counts[city] = (counts[city] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([label, count]) => ({
      label,
      count,
      percentage: Math.round((count / total) * 100),
    }));
}

export function computeConfidenceBuckets(entries: TalentEntry[]): DistributionEntry[] {
  const total = entries.length;
  if (total === 0) return [];
  const buckets: Record<string, number> = {
    high: 0,
    medium: 0,
    low: 0,
    below: 0,
  };
  for (const e of entries) {
    const c = e.china_confidence;
    if (c >= 0.7) buckets['high'] = (buckets['high'] ?? 0) + 1;
    else if (c >= 0.4) buckets['medium'] = (buckets['medium'] ?? 0) + 1;
    else if (c >= 0.2) buckets['low'] = (buckets['low'] ?? 0) + 1;
    else buckets['below'] = (buckets['below'] ?? 0) + 1;
  }
  return Object.entries(buckets).map(([label, count]) => ({
    label,
    count,
    percentage: Math.round((count / total) * 100),
  }));
}

export function computeSignalTypeDistribution(
  entries: TalentEntry[],
  topN: number = 10
): DistributionEntry[] {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    for (const st of e.signal_types) {
      counts[st] = (counts[st] ?? 0) + 1;
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([label, count]) => ({
      label,
      count,
      percentage: Math.round((count / total) * 100),
    }));
}
