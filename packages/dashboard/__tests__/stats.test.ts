import type { RunStats } from '@talent-scout/ai-evaluator';
import type { TalentEntry } from '@talent-scout/shared';
import { describe, expect, it } from 'vitest';

import {
  computeActionDistribution,
  computeCityDistribution,
  computeConfidenceBuckets,
  computeHistoryTrends,
  computeSignalTypeDistribution,
  computeTierDistribution,
  resolveHeadlineTotal,
} from '../src/lib/stats.js';

function entry(overrides: Partial<TalentEntry> = {}): TalentEntry {
  return {
    username: 'user1',
    name: null,
    city: null,
    company: null,
    email: null,
    blog: null,
    twitter: null,
    profile_url: 'https://github.com/user1',
    china_confidence: 0.8,
    skill_score: 5,
    ai_depth_score: 3,
    ai_depth_tier: 'builder',
    reachability_score: 2,
    fit_score: 1,
    final_score: 11,
    recommended_action: 'reach_out',
    summary: '',
    signal_types: [],
    signal_count: 0,
    ...overrides,
  };
}

describe('computeActionDistribution', () => {
  it('counts actions correctly', () => {
    const entries = [
      entry({ recommended_action: 'reach_out' }),
      entry({ recommended_action: 'reach_out' }),
      entry({ recommended_action: 'skip' }),
    ];
    const dist = computeActionDistribution(entries);
    const reachOut = dist.find((d) => d.label === 'reach_out');
    expect(reachOut?.count).toBe(2);
    expect(reachOut?.percentage).toBe(67);
  });

  it('returns empty for empty input', () => {
    expect(computeActionDistribution([])).toHaveLength(0);
  });
});

describe('computeTierDistribution', () => {
  it('counts tiers correctly', () => {
    const entries = [
      entry({ ai_depth_tier: 'builder' }),
      entry({ ai_depth_tier: 'builder' }),
      entry({ ai_depth_tier: 'consumer' }),
    ];
    const dist = computeTierDistribution(entries);
    expect(dist.find((d) => d.label === 'builder')?.count).toBe(2);
  });
});

describe('computeCityDistribution', () => {
  it('returns top N cities sorted by count', () => {
    const entries = [
      entry({ city: 'Beijing' }),
      entry({ city: 'Beijing' }),
      entry({ city: 'Shanghai' }),
      entry({ city: null }),
    ];
    const dist = computeCityDistribution(entries, 2);
    expect(dist).toHaveLength(2);
    expect(dist[0]?.label).toBe('Beijing');
  });
});

describe('computeConfidenceBuckets', () => {
  it('buckets confidence values correctly', () => {
    const entries = [
      entry({ china_confidence: 0.9 }),
      entry({ china_confidence: 0.5 }),
      entry({ china_confidence: 0.25 }),
      entry({ china_confidence: 0.1 }),
    ];
    const buckets = computeConfidenceBuckets(entries);
    expect(buckets.find((b) => b.label === 'high')?.count).toBe(1);
    expect(buckets.find((b) => b.label === 'medium')?.count).toBe(1);
    expect(buckets.find((b) => b.label === 'low')?.count).toBe(1);
    expect(buckets.find((b) => b.label === 'below')?.count).toBe(1);
  });

  it('returns empty for empty input', () => {
    expect(computeConfidenceBuckets([])).toHaveLength(0);
  });
});

describe('computeSignalTypeDistribution', () => {
  it('counts signal types across entries', () => {
    const entries = [
      entry({ signal_types: ['code:claude-md', 'commit:claude-coauthor'] }),
      entry({ signal_types: ['code:claude-md', 'topic:cursor-ai'] }),
      entry({ signal_types: ['commit:claude-coauthor'] }),
    ];
    const dist = computeSignalTypeDistribution(entries, 10);
    expect(dist.find((d) => d.label === 'code:claude-md')?.count).toBe(2);
    expect(dist.find((d) => d.label === 'commit:claude-coauthor')?.count).toBe(2);
    expect(dist.find((d) => d.label === 'topic:cursor-ai')?.count).toBe(1);
  });

  it('returns empty for entries with no signals', () => {
    expect(computeSignalTypeDistribution([entry()], 10)).toHaveLength(0);
  });
});

function makeRunStats(overrides: Partial<RunStats> = {}): RunStats {
  return {
    total_candidates: 10,
    identified_chinese: 5,
    evaluated: 4,
    reach_out: 2,
    monitor: 1,
    skip: 1,
    avg_skill_score: 6.0,
    avg_ai_depth_score: 5.0,
    run_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('computeHistoryTrends', () => {
  it('returns points from history', () => {
    const history = [makeRunStats(), makeRunStats({ run_at: '2025-01-02T00:00:00Z' })];
    const trends = computeHistoryTrends(history);
    expect(trends.points).toHaveLength(2);
    expect(trends.points[0]?.run_at).toBe('2025-01-01T00:00:00Z');
  });

  it('computes delta between last two runs', () => {
    const history = [
      makeRunStats({ total_candidates: 10, reach_out: 2, avg_skill_score: 5.0 }),
      makeRunStats({ total_candidates: 15, reach_out: 4, avg_skill_score: 6.5 }),
    ];
    const trends = computeHistoryTrends(history);
    expect(trends.delta).not.toBeNull();
    expect(trends.delta?.total_candidates).toBe(5);
    expect(trends.delta?.reach_out).toBe(2);
    expect(trends.delta?.avg_skill_score).toBe(1.5);
  });

  it('returns null delta for single run', () => {
    const trends = computeHistoryTrends([makeRunStats()]);
    expect(trends.points).toHaveLength(1);
    expect(trends.delta).toBeNull();
  });

  it('returns empty for no history', () => {
    const trends = computeHistoryTrends([]);
    expect(trends.points).toHaveLength(0);
    expect(trends.delta).toBeNull();
  });

  it('limits to maxPoints', () => {
    const history = Array.from({ length: 30 }, (_, i) =>
      makeRunStats({ run_at: `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` })
    );
    const trends = computeHistoryTrends(history, 10);
    expect(trends.points).toHaveLength(10);
  });
});

describe('resolveHeadlineTotal', () => {
  it('prefers the latest historical total', () => {
    const total = resolveHeadlineTotal(
      [entry(), entry()],
      [makeRunStats({ total_candidates: 2313 })]
    );
    expect(total).toBe(2313);
  });

  it('falls back to shortlist length without history', () => {
    const total = resolveHeadlineTotal([entry(), entry(), entry()], []);
    expect(total).toBe(3);
  });
});
