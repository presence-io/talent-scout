import type { TalentEntry } from '@talent-scout/shared';
import { describe, expect, it } from 'vitest';

import { mergeWithAnnotations, mergeWithIgnoreList } from '../src/lib/merge.js';
import type { AnnotationMap } from '../src/lib/merge.js';

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

describe('mergeWithAnnotations', () => {
  it('attaches annotation to matching entry', () => {
    const entries = [entry({ username: 'alice' }), entry({ username: 'bob' })];
    const annotations: AnnotationMap = {
      alice: {
        status: 'approved',
        note: 'Good',
        annotated_at: '2025-01-01T00:00:00Z',
      },
    };
    const result = mergeWithAnnotations(entries, annotations);
    expect(result[0]?.annotation?.status).toBe('approved');
    expect(result[1]?.annotation).toBeUndefined();
  });

  it('handles empty annotations', () => {
    const entries = [entry()];
    const result = mergeWithAnnotations(entries, {});
    expect(result[0]?.annotation).toBeUndefined();
  });
});

describe('mergeWithIgnoreList', () => {
  it('marks ignored entries', () => {
    const entries = [entry({ username: 'alice' }), entry({ username: 'bob' })];
    const ignoreList = {
      alice: { reason: 'spam', ignored_at: '2025-01-01T00:00:00Z' },
    };
    const result = mergeWithIgnoreList(entries, ignoreList);
    expect(result[0]?.ignored).toBe(true);
    expect(result[1]?.ignored).toBeUndefined();
  });
});
