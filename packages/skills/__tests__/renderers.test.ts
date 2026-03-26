import { describe, it, expect } from 'vitest';

import { renderShortlistText, renderCandidateText, renderStatsText } from '../src/renderers.js';
import type { Candidate, TalentEntry } from '@talent-scout/shared';
import type { RunStats } from '@talent-scout/ai-evaluator';

describe('renderShortlistText', () => {
  it('returns empty message for no entries', () => {
    expect(renderShortlistText([])).toBe('No candidates in shortlist.');
  });

  it('renders entries as text table', () => {
    const entries: TalentEntry[] = [
      {
        username: 'testuser',
        name: 'Test',
        city: 'Beijing',
        company: null,
        email: null,
        blog: null,
        twitter: null,
        profile_url: 'https://github.com/testuser',
        china_confidence: 0.95,
        skill_score: 7.5,
        ai_depth_score: 6.0,
        ai_depth_tier: 'user',
        reachability_score: 5.0,
        fit_score: 8.0,
        final_score: 7.2,
        recommended_action: 'reach_out',
        summary: 'Good candidate',
        signal_types: ['code:claude-md'],
        signal_count: 3,
      },
    ];
    const result = renderShortlistText(entries);
    expect(result).toContain('testuser');
    expect(result).toContain('7.2');
    expect(result).toContain('REACH_OUT');
    expect(result).toContain('Beijing');
  });
});

describe('renderCandidateText', () => {
  it('renders candidate with profile and evaluation', () => {
    const candidate: Candidate = {
      username: 'devuser',
      signals: [{ type: 'code:claude-md', detail: 'Found CLAUDE.md', weight: 2, source: 'github' }],
      signal_score: 2,
      is_ai_coding_enthusiast: true,
      profile: {
        login: 'devuser',
        name: 'Dev User',
        location: 'Beijing, China',
        email: 'dev@test.com',
        blog: 'https://dev.cn',
        twitter: null,
        bio: 'Developer',
        company: 'TechCo',
        hireable: true,
        public_repos: 30,
        followers: 100,
        following: 50,
        created_at: '2020-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        recent_repos: [],
      },
      identity: {
        china_confidence: 0.95,
        city: 'Beijing',
        signals: [{ tier: 1, type: 'location:explicit', confidence: 0.92, evidence: 'Beijing' }],
        ai_assisted: false,
        inferred_at: '2025-01-01T00:00:00Z',
      },
      evaluation: {
        skill_score: 7.0,
        skill_evidence: ['Good repos'],
        ai_depth_score: 6.0,
        ai_depth_tier: 'user',
        ai_depth_evidence: ['Uses Claude'],
        reachability_score: 8.0,
        reachability_evidence: ['Has email'],
        fit_score: 7.0,
        fit_evidence: ['TypeScript match'],
        final_score: 7.1,
        recommended_action: 'reach_out',
        summary: 'Strong candidate',
        evaluated_at: '2025-01-01T00:00:00Z',
      },
    };
    const result = renderCandidateText(candidate);
    expect(result).toContain('devuser');
    expect(result).toContain('Dev User');
    expect(result).toContain('Beijing');
    expect(result).toContain('7.0');
    expect(result).toContain('reach_out');
  });

  it('renders candidate without profile', () => {
    const candidate: Candidate = {
      username: 'noinfo',
      signals: [],
      signal_score: 0,
      is_ai_coding_enthusiast: false,
    };
    const result = renderCandidateText(candidate);
    expect(result).toContain('noinfo');
    expect(result).toContain('Signals (0)');
  });
});

describe('renderStatsText', () => {
  it('renders stats output', () => {
    const stats: RunStats = {
      total_candidates: 100,
      identified_chinese: 50,
      evaluated: 40,
      reach_out: 10,
      monitor: 20,
      skip: 10,
      avg_skill_score: 6.5,
      avg_ai_depth_score: 5.2,
      run_at: '2025-01-01T00:00:00Z',
    };
    const result = renderStatsText(stats);
    expect(result).toContain('100');
    expect(result).toContain('50');
    expect(result).toContain('6.5');
    expect(result).toContain('5.2');
  });
});
