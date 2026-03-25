import { describe, it, expect } from 'vitest';

import type { Candidate, GitHubProfile, RepoSummary } from '@talent-scout/shared';
import { TalentConfigSchema } from '@talent-scout/shared';
import {
  extractSkillFeatures,
  computeSkillScore,
  computeAIDepthScore,
  computeReachabilityScore,
  computeFitScore,
  computeFinalScore,
  determineAction,
  evaluateCandidate,
} from '../src/scoring.js';

function makeRepo(overrides: Partial<RepoSummary> = {}): RepoSummary {
  return {
    name: 'test-repo',
    full_name: 'user/test-repo',
    description: 'A test repo',
    stars: 10,
    forks: 2,
    language: 'TypeScript',
    topics: [],
    is_fork: false,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeProfile(overrides: Partial<GitHubProfile> = {}): GitHubProfile {
  return {
    login: 'testuser',
    name: 'Test User',
    location: null,
    email: null,
    blog: null,
    twitter: null,
    bio: null,
    company: null,
    hireable: null,
    public_repos: 10,
    followers: 50,
    following: 20,
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    recent_repos: [makeRepo()],
    ...overrides,
  };
}

function makeCandidate(
  profileOverrides?: Partial<GitHubProfile>,
  candidateOverrides?: Partial<Candidate>,
): Candidate {
  return {
    username: 'testuser',
    signals: [],
    signal_score: 0,
    is_ai_coding_enthusiast: false,
    profile: makeProfile(profileOverrides),
    ...candidateOverrides,
  };
}

const defaultConfig = TalentConfigSchema.parse({});

describe('extractSkillFeatures', () => {
  it('should extract log-scaled stars', () => {
    const profile = makeProfile({
      recent_repos: [makeRepo({ stars: 999 })],
    });
    const f = extractSkillFeatures(profile);
    expect(f.total_stars_log).toBeCloseTo(Math.log10(1000), 5);
  });

  it('should count owned (non-fork) repos', () => {
    const profile = makeProfile({
      recent_repos: [
        makeRepo({ is_fork: false }),
        makeRepo({ is_fork: true }),
        makeRepo({ is_fork: false }),
      ],
    });
    const f = extractSkillFeatures(profile);
    expect(f.owned_repo_count).toBe(2);
  });

  it('should compute fork ratio', () => {
    const profile = makeProfile({
      recent_repos: [
        makeRepo({ is_fork: true }),
        makeRepo({ is_fork: true }),
        makeRepo({ is_fork: false }),
      ],
    });
    const f = extractSkillFeatures(profile);
    expect(f.fork_ratio).toBeCloseTo(2 / 3, 5);
  });

  it('should count distinct languages', () => {
    const profile = makeProfile({
      recent_repos: [
        makeRepo({ language: 'TypeScript' }),
        makeRepo({ language: 'Go' }),
        makeRepo({ language: 'TypeScript' }),
      ],
    });
    const f = extractSkillFeatures(profile);
    expect(f.language_count).toBe(2);
  });
});

describe('computeSkillScore', () => {
  it('should return value between 1 and 10', () => {
    const profile = makeProfile();
    const f = extractSkillFeatures(profile);
    const score = computeSkillScore(f);
    expect(score).toBeGreaterThanOrEqual(1);
    expect(score).toBeLessThanOrEqual(10);
  });

  it('should penalize high fork ratio', () => {
    const lowFork = computeSkillScore({
      total_stars_log: 2,
      total_forks_log: 1,
      owned_repo_count: 5,
      max_repo_stars: 100,
      active_months: 6,
      recent_contributions: 50,
      language_count: 3,
      followers_log: 2,
      fork_ratio: 0.2,
      anti_pattern_penalty: 0,
    });
    const highFork = computeSkillScore({
      total_stars_log: 2,
      total_forks_log: 1,
      owned_repo_count: 5,
      max_repo_stars: 100,
      active_months: 6,
      recent_contributions: 50,
      language_count: 3,
      followers_log: 2,
      fork_ratio: 0.8,
      anti_pattern_penalty: 0,
    });
    expect(highFork).toBeLessThan(lowFork);
  });
});

describe('computeAIDepthScore', () => {
  it('should classify consumer tier', () => {
    const result = computeAIDepthScore({
      ai_config_repo_count: 0,
      ai_coauthor_commit_count: 0,
      has_ai_builder_project: false,
      ai_project_stars: 0,
      has_ai_community_maintenance: false,
      is_ai_coding_enthusiast: false,
    });
    expect(result.tier).toBe('consumer');
    expect(result.score).toBe(2);
  });

  it('should classify user tier', () => {
    const result = computeAIDepthScore({
      ai_config_repo_count: 2,
      ai_coauthor_commit_count: 5,
      has_ai_builder_project: false,
      ai_project_stars: 0,
      has_ai_community_maintenance: false,
      is_ai_coding_enthusiast: true,
    });
    expect(result.tier).toBe('user');
    expect(result.score).toBeGreaterThanOrEqual(4.5);
  });

  it('should classify builder tier', () => {
    const result = computeAIDepthScore({
      ai_config_repo_count: 1,
      ai_coauthor_commit_count: 3,
      has_ai_builder_project: true,
      ai_project_stars: 200,
      has_ai_community_maintenance: false,
      is_ai_coding_enthusiast: true,
    });
    expect(result.tier).toBe('builder');
    expect(result.score).toBeGreaterThanOrEqual(7.5);
  });

  it('should classify amplifier tier', () => {
    const result = computeAIDepthScore({
      ai_config_repo_count: 5,
      ai_coauthor_commit_count: 10,
      has_ai_builder_project: true,
      ai_project_stars: 1000,
      has_ai_community_maintenance: true,
      is_ai_coding_enthusiast: true,
    });
    expect(result.tier).toBe('amplifier');
    expect(result.score).toBe(9.5);
  });
});

describe('computeReachabilityScore', () => {
  it('should start at 1', () => {
    const score = computeReachabilityScore({
      has_email: false,
      has_blog: false,
      has_twitter: false,
      has_hireable: false,
      has_bio: false,
      has_chinese_community_profile: false,
    });
    expect(score).toBe(1);
  });

  it('should add points for each feature', () => {
    const score = computeReachabilityScore({
      has_email: true,
      has_blog: true,
      has_twitter: true,
      has_hireable: true,
      has_bio: true,
      has_chinese_community_profile: true,
    });
    // 1 + 3 + 2 + 1 + 1 + 0.5 + 1.5 = 10
    expect(score).toBe(10);
  });
});

describe('computeFitScore', () => {
  it('should return base score of 5 with no matches', () => {
    const score = computeFitScore({
      city_bonus: 0,
      language_match: false,
      is_too_senior: false,
    });
    expect(score).toBe(5);
  });

  it('should add city bonus', () => {
    const score = computeFitScore({
      city_bonus: 3,
      language_match: false,
      is_too_senior: false,
    });
    expect(score).toBe(8);
  });

  it('should penalize too senior', () => {
    const score = computeFitScore({
      city_bonus: 0,
      language_match: false,
      is_too_senior: true,
    });
    expect(score).toBe(2);
  });

  it('should clamp between 1 and 10', () => {
    const low = computeFitScore({
      city_bonus: 0,
      language_match: false,
      is_too_senior: true,
    });
    expect(low).toBeGreaterThanOrEqual(1);

    const high = computeFitScore({
      city_bonus: 3,
      language_match: true,
      is_too_senior: false,
    });
    expect(high).toBeLessThanOrEqual(10);
  });
});

describe('computeFinalScore', () => {
  it('should compute weighted sum', () => {
    const score = computeFinalScore(
      { skill: 8, ai_depth: 7, reachability: 6, fit: 5 },
      defaultConfig,
      50,
    );
    // 8*0.35 + 7*0.3 + 6*0.15 + 5*0.2 = 2.8 + 2.1 + 0.9 + 1.0 = 6.8
    expect(score).toBeCloseTo(6.8, 1);
  });

  it('should apply activity penalty for inactive users', () => {
    const active = computeFinalScore(
      { skill: 8, ai_depth: 7, reachability: 6, fit: 5 },
      defaultConfig,
      50,
    );
    const inactive = computeFinalScore(
      { skill: 8, ai_depth: 7, reachability: 6, fit: 5 },
      defaultConfig,
      5,
    );
    expect(inactive).toBeLessThan(active);
  });

  it('should not go below 0', () => {
    const score = computeFinalScore(
      { skill: 1, ai_depth: 1, reachability: 1, fit: 1 },
      defaultConfig,
      0,
    );
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('determineAction', () => {
  it('should skip if skill and ai_depth both low', () => {
    expect(determineAction(8, 8, 2, 2)).toBe('skip');
  });

  it('should reach_out for high score and reachability', () => {
    expect(determineAction(7.5, 6, 8, 7)).toBe('reach_out');
  });

  it('should monitor for moderate score', () => {
    expect(determineAction(5.5, 3, 6, 5)).toBe('monitor');
  });

  it('should skip for low score', () => {
    expect(determineAction(3.0, 5, 5, 5)).toBe('skip');
  });
});

describe('evaluateCandidate', () => {
  it('should return empty evaluation when no profile', () => {
    const candidate: Candidate = {
      username: 'test',
      signals: [],
      signal_score: 0,
      is_ai_coding_enthusiast: false,
    };
    const result = evaluateCandidate(candidate, defaultConfig);
    expect(result.final_score).toBe(0);
    expect(result.recommended_action).toBe('skip');
  });

  it('should produce full evaluation with profile', () => {
    const candidate = makeCandidate(
      {
        email: 'test@gmail.com',
        blog: 'https://test.dev',
        followers: 100,
        recent_repos: [
          makeRepo({ stars: 500, language: 'TypeScript' }),
          makeRepo({ stars: 100, language: 'Go' }),
        ],
      },
      {
        signals: [{ type: 'code:claude-md', detail: 'test', weight: 2, source: 'test' }],
      },
    );

    const result = evaluateCandidate(candidate, defaultConfig);
    expect(result.skill_score).toBeGreaterThan(0);
    expect(result.ai_depth_score).toBeGreaterThan(0);
    expect(result.reachability_score).toBeGreaterThan(0);
    expect(result.fit_score).toBeGreaterThan(0);
    expect(result.final_score).toBeGreaterThan(0);
    expect(result.summary).toContain('testuser');
    expect(result.evaluated_at).toBeTruthy();
    expect(candidate.features).toBeDefined();
  });

  it('should attach features to candidate', () => {
    const candidate = makeCandidate({
      recent_repos: [makeRepo()],
    });
    evaluateCandidate(candidate, defaultConfig);
    expect(candidate.features).toBeDefined();
    expect(candidate.features?.skill).toBeDefined();
    expect(candidate.features?.ai_depth).toBeDefined();
    expect(candidate.features?.reachability).toBeDefined();
    expect(candidate.features?.fit).toBeDefined();
  });
});
