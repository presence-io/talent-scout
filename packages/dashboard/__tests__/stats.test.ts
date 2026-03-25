import { describe, it, expect } from 'vitest';
import type { TalentEntry } from '@talent-scout/shared';
import {
  computeActionDistribution,
  computeTierDistribution,
  computeCityDistribution,
  computeConfidenceBuckets,
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
