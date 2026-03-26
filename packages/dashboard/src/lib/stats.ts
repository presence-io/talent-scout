import type { TalentEntry } from '@talent-scout/shared';

export interface DistributionEntry {
  label: string;
  count: number;
  percentage: number;
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
