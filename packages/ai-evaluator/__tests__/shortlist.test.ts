import type { Candidate, Evaluation } from '@talent-scout/shared';
import { describe, expect, it } from 'vitest';

import { candidateToTalentEntry, produceShortlist } from '../src/shortlist.js';

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    username: 'testuser',
    signals: [{ type: 'code:claude-md', detail: 'test', weight: 1, source: 'test' }],
    signal_score: 1,
    is_ai_coding_enthusiast: false,
    ...overrides,
  };
}

function makeEvaluation(overrides: Partial<Evaluation> = {}): Evaluation {
  return {
    skill_score: 7,
    skill_evidence: ['test'],
    ai_depth_score: 6,
    ai_depth_tier: 'user',
    ai_depth_evidence: ['test'],
    reachability_score: 5,
    reachability_evidence: ['test'],
    fit_score: 6,
    fit_evidence: ['test'],
    final_score: 6.5,
    recommended_action: 'monitor',
    summary: 'Test summary',
    evaluated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('candidateToTalentEntry', () => {
  it('should convert a candidate with full data', () => {
    const candidate = makeCandidate({
      profile: {
        login: 'testuser',
        name: 'Test User',
        location: 'Beijing',
        email: 'test@example.com',
        blog: 'https://test.dev',
        twitter: 'testuser',
        bio: 'Developer',
        company: 'TestCo',
        hireable: true,
        public_repos: 10,
        followers: 100,
        following: 50,
        created_at: '2020-01-01',
        updated_at: '2025-01-01',
        recent_repos: [],
      },
      identity: {
        china_confidence: 0.9,
        city: 'beijing',
        signals: [],
        ai_assisted: false,
        inferred_at: '2025-01-01T00:00:00Z',
      },
      evaluation: makeEvaluation({
        recommended_action: 'reach_out',
        final_score: 8,
      }),
    });

    const entry = candidateToTalentEntry(candidate);

    expect(entry.username).toBe('testuser');
    expect(entry.name).toBe('Test User');
    expect(entry.city).toBe('beijing');
    expect(entry.email).toBe('test@example.com');
    expect(entry.profile_url).toBe('https://github.com/testuser');
    expect(entry.china_confidence).toBe(0.9);
    expect(entry.final_score).toBe(8);
    expect(entry.recommended_action).toBe('reach_out');
    expect(entry.signal_types).toEqual(['code:claude-md']);
    expect(entry.signal_count).toBe(1);
  });

  it('should handle missing profile and identity', () => {
    const candidate = makeCandidate();
    const entry = candidateToTalentEntry(candidate);

    expect(entry.name).toBeNull();
    expect(entry.city).toBeNull();
    expect(entry.email).toBeNull();
    expect(entry.china_confidence).toBe(0);
    expect(entry.final_score).toBe(0);
    expect(entry.recommended_action).toBe('skip');
  });

  it('should deduplicate signal types', () => {
    const candidate = makeCandidate({
      signals: [
        { type: 'code:claude-md', detail: 'a', weight: 1, source: 's' },
        { type: 'code:claude-md', detail: 'b', weight: 1, source: 's' },
        { type: 'commit:claude-coauthor', detail: 'c', weight: 1, source: 's' },
      ],
    });
    const entry = candidateToTalentEntry(candidate);
    expect(entry.signal_types).toEqual(['code:claude-md', 'commit:claude-coauthor']);
    expect(entry.signal_count).toBe(3);
  });
});

describe('produceShortlist', () => {
  it('should exclude candidates without evaluation', () => {
    const candidates = [makeCandidate()];
    expect(produceShortlist(candidates)).toHaveLength(0);
  });

  it('should exclude candidates with skip action', () => {
    const candidates = [
      makeCandidate({
        evaluation: makeEvaluation({
          recommended_action: 'skip',
          final_score: 3,
        }),
      }),
    ];
    expect(produceShortlist(candidates)).toHaveLength(0);
  });

  it('should include reach_out and monitor candidates', () => {
    const candidates = [
      makeCandidate({
        username: 'a',
        evaluation: makeEvaluation({
          recommended_action: 'reach_out',
          final_score: 9,
        }),
      }),
      makeCandidate({
        username: 'b',
        evaluation: makeEvaluation({
          recommended_action: 'monitor',
          final_score: 6,
        }),
      }),
      makeCandidate({
        username: 'c',
        evaluation: makeEvaluation({
          recommended_action: 'skip',
          final_score: 2,
        }),
      }),
    ];
    const shortlist = produceShortlist(candidates);
    expect(shortlist).toHaveLength(2);
    expect(shortlist[0].username).toBe('a');
    expect(shortlist[1].username).toBe('b');
  });

  it('should sort by final_score descending', () => {
    const candidates = [
      makeCandidate({
        username: 'low',
        evaluation: makeEvaluation({
          recommended_action: 'monitor',
          final_score: 5,
        }),
      }),
      makeCandidate({
        username: 'high',
        evaluation: makeEvaluation({
          recommended_action: 'reach_out',
          final_score: 9,
        }),
      }),
      makeCandidate({
        username: 'mid',
        evaluation: makeEvaluation({
          recommended_action: 'monitor',
          final_score: 7,
        }),
      }),
    ];
    const shortlist = produceShortlist(candidates);
    expect(shortlist.map((e) => e.username)).toEqual(['high', 'mid', 'low']);
  });
});
