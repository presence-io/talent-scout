import type { TalentEntry } from '@talent-scout/shared';
import { describe, expect, it } from 'vitest';

import {
  filterByAIDepthTier,
  filterByAction,
  filterByCity,
  paginateCandidates,
  sortCandidates,
} from '../src/lib/candidates.js';

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

describe('sortCandidates', () => {
  it('sorts by final_score desc by default', () => {
    const list = [
      entry({ username: 'a', final_score: 5 }),
      entry({ username: 'b', final_score: 10 }),
    ];
    const result = sortCandidates(list);
    expect(result[0]?.username).toBe('b');
  });

  it('sorts by username asc', () => {
    const list = [entry({ username: 'charlie' }), entry({ username: 'alice' })];
    const result = sortCandidates(list, 'username', 'asc');
    expect(result[0]?.username).toBe('alice');
  });

  it('does not mutate original array', () => {
    const list = [entry({ final_score: 1 }), entry({ final_score: 2 })];
    sortCandidates(list);
    expect(list[0]?.final_score).toBe(1);
  });
});

describe('filterByAction', () => {
  it('filters by recommended action', () => {
    const list = [
      entry({ recommended_action: 'reach_out' }),
      entry({ recommended_action: 'skip' }),
      entry({ recommended_action: 'reach_out' }),
    ];
    expect(filterByAction(list, 'reach_out')).toHaveLength(2);
  });
});

describe('filterByCity', () => {
  it('filters case-insensitively', () => {
    const list = [entry({ city: 'Beijing' }), entry({ city: 'Shanghai' }), entry({ city: null })];
    expect(filterByCity(list, 'beijing')).toHaveLength(1);
  });

  it('handles partial match', () => {
    const list = [entry({ city: 'Beijing, China' })];
    expect(filterByCity(list, 'beijing')).toHaveLength(1);
  });
});

describe('filterByAIDepthTier', () => {
  it('filters by tier', () => {
    const list = [entry({ ai_depth_tier: 'builder' }), entry({ ai_depth_tier: 'consumer' })];
    expect(filterByAIDepthTier(list, 'builder')).toHaveLength(1);
  });
});

describe('paginateCandidates', () => {
  const list = Array.from({ length: 120 }, (_, i) => entry({ username: `u${i}` }));

  it('returns correct page size', () => {
    const result = paginateCandidates(list, 1, 50);
    expect(result.items).toHaveLength(50);
    expect(result.totalPages).toBe(3);
    expect(result.totalItems).toBe(120);
  });

  it('returns last page with remainder', () => {
    const result = paginateCandidates(list, 3, 50);
    expect(result.items).toHaveLength(20);
  });

  it('clamps page to valid range', () => {
    const result = paginateCandidates(list, 999, 50);
    expect(result.page).toBe(3);
  });

  it('handles empty list', () => {
    const result = paginateCandidates([], 1);
    expect(result.items).toHaveLength(0);
    expect(result.totalPages).toBe(1);
  });
});
