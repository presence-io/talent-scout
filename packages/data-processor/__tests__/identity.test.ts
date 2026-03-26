import type { Candidate, GitHubProfile } from '@talent-scout/shared';
import { describe, expect, it } from 'vitest';

import {
  computeChinaConfidence,
  containsSimplifiedChinese,
  identifyCandidate,
} from '../src/identity.js';

function makeProfile(overrides: Partial<GitHubProfile> = {}): GitHubProfile {
  return {
    login: 'testuser',
    name: null,
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
    recent_repos: [],
    ...overrides,
  };
}

function makeCandidate(profile?: Partial<GitHubProfile>): Candidate {
  return {
    username: 'testuser',
    signals: [],
    signal_score: 0,
    is_ai_coding_enthusiast: false,
    profile: profile ? makeProfile(profile) : undefined,
  };
}

describe('containsSimplifiedChinese', () => {
  it('should detect simplified Chinese', () => {
    expect(containsSimplifiedChinese('这是一个测试')).toBe(true);
  });

  it('should return false for English text', () => {
    expect(containsSimplifiedChinese('hello world')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(containsSimplifiedChinese('')).toBe(false);
  });

  it('should return false for Japanese text with kana', () => {
    expect(containsSimplifiedChinese('日本語のテスト')).toBe(false);
  });
});

describe('computeChinaConfidence', () => {
  it('should return 0 for empty signals', () => {
    expect(computeChinaConfidence([])).toBe(0);
  });

  it('should return 0.95 for Tier 1 signal', () => {
    const result = computeChinaConfidence([
      {
        tier: 1,
        type: 'location:explicit',
        confidence: 0.92,
        evidence: 'test',
      },
    ]);
    expect(result).toBe(0.95);
  });

  it('should use noisy-or for Tier 2+ signals', () => {
    const result = computeChinaConfidence([
      {
        tier: 2,
        type: 'bio:simplified-chinese',
        confidence: 0.75,
        evidence: 'test',
      },
      { tier: 2, type: 'company:china', confidence: 0.8, evidence: 'test' },
    ]);
    // noisy-or: 1 - (1-0.75)*(1-0.8) = 1 - 0.25*0.2 = 0.95
    expect(result).toBe(0.95);
  });

  it('should cap at 0.95', () => {
    const result = computeChinaConfidence([
      { tier: 2, type: 'a', confidence: 0.9, evidence: 'test' },
      { tier: 2, type: 'b', confidence: 0.9, evidence: 'test' },
      { tier: 2, type: 'c', confidence: 0.9, evidence: 'test' },
    ]);
    expect(result).toBeLessThanOrEqual(0.95);
  });
});

describe('identifyCandidate', () => {
  it('should return zero confidence for candidate without profile', () => {
    const candidate = makeCandidate();
    candidate.profile = undefined;
    const result = identifyCandidate(candidate);
    expect(result.china_confidence).toBe(0);
    expect(result.signals).toHaveLength(0);
  });

  it('should detect Beijing location as Tier 1', () => {
    const result = identifyCandidate(makeCandidate({ location: 'Beijing, China' }));
    expect(result.china_confidence).toBe(0.95);
    expect(result.city).toBe('Beijing');
    expect(result.signals.some((s) => s.tier === 1)).toBe(true);
  });

  it('should detect Chinese email domain', () => {
    const result = identifyCandidate(makeCandidate({ email: 'user@qq.com' }));
    expect(result.china_confidence).toBe(0.95);
  });

  it('should exclude Hong Kong', () => {
    const result = identifyCandidate(makeCandidate({ location: 'Hong Kong, China' }));
    // Should not trigger location signal (Hong Kong is excluded)
    const locationSignal = result.signals.find((s) => s.type === 'location:explicit');
    expect(locationSignal).toBeUndefined();
  });

  it('should detect Chinese company', () => {
    const result = identifyCandidate(makeCandidate({ company: '@ByteDance' }));
    expect(result.china_confidence).toBeGreaterThan(0);
    expect(result.signals.some((s) => s.type === 'company:china')).toBe(true);
  });

  it('should detect .cn blog domain', () => {
    const result = identifyCandidate(makeCandidate({ blog: 'https://mysite.cn' }));
    expect(result.china_confidence).toBeGreaterThan(0);
    expect(result.signals.some((s) => s.type === 'blog:cn-domain')).toBe(true);
  });

  it('should detect Chinese social platform in bio', () => {
    const result = identifyCandidate(makeCandidate({ bio: 'Follow me on zhihu.com/people/test' }));
    expect(result.china_confidence).toBeGreaterThan(0);
    expect(result.signals.some((s) => s.type === 'social:china-platform')).toBe(true);
  });

  it('should not detect non-Chinese profile', () => {
    const result = identifyCandidate(
      makeCandidate({
        location: 'San Francisco, CA',
        email: 'user@gmail.com',
        bio: 'Software engineer',
      })
    );
    expect(result.china_confidence).toBe(0);
    expect(result.signals).toHaveLength(0);
  });

  it('should combine multiple Tier 2 signals', () => {
    const result = identifyCandidate(
      makeCandidate({
        company: '@Tencent',
        blog: 'https://mysite.cn',
      })
    );
    // Two Tier 2 signals should combine
    expect(result.signals.length).toBeGreaterThanOrEqual(2);
    expect(result.china_confidence).toBeGreaterThan(0.7);
  });

  it('should detect profile README with simplified Chinese (Tier 2)', () => {
    const result = identifyCandidate(
      makeCandidate({
        recent_repos: [
          {
            name: 'testuser',
            full_name: 'testuser/testuser',
            description: '这是我的个人简介仓库',
            stars: 0,
            forks: 0,
            language: null,
            topics: [],
            is_fork: false,
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      })
    );
    expect(result.signals.some((s) => s.type === 'readme:profile-chinese')).toBe(true);
  });

  it('should detect Chinese repo descriptions (Tier 3)', () => {
    const repos = [
      {
        name: 'repo1',
        full_name: 'testuser/repo1',
        description: '这是一个非常好的项目',
        stars: 10,
        forks: 2,
        language: 'TypeScript',
        topics: [],
        is_fork: false,
        updated_at: '2024-01-01T00:00:00Z',
      },
      {
        name: 'repo2',
        full_name: 'testuser/repo2',
        description: '这个工具很好用',
        stars: 5,
        forks: 1,
        language: 'Python',
        topics: [],
        is_fork: false,
        updated_at: '2024-01-01T00:00:00Z',
      },
    ];
    const result = identifyCandidate(makeCandidate({ recent_repos: repos }));
    expect(result.signals.some((s) => s.type === 'repo:description-chinese')).toBe(true);
    expect(result.china_confidence).toBeGreaterThan(0);
  });

  it('should not trigger Tier 3 repo desc with only 1 Chinese repo', () => {
    const repos = [
      {
        name: 'repo1',
        full_name: 'testuser/repo1',
        description: '这是一个非常好的项目',
        stars: 10,
        forks: 2,
        language: 'TypeScript',
        topics: [],
        is_fork: false,
        updated_at: '2024-01-01T00:00:00Z',
      },
      {
        name: 'repo2',
        full_name: 'testuser/repo2',
        description: 'An English project',
        stars: 5,
        forks: 1,
        language: 'Python',
        topics: [],
        is_fork: false,
        updated_at: '2024-01-01T00:00:00Z',
      },
    ];
    const result = identifyCandidate(makeCandidate({ recent_repos: repos }));
    expect(result.signals.some((s) => s.type === 'repo:description-chinese')).toBe(false);
  });

  it('should detect Chinese commit messages (Tier 3)', () => {
    const candidate: Candidate = {
      username: 'testuser',
      signals: [
        {
          type: 'commit:claude-coauthor',
          detail: '修复这个问题',
          weight: 1,
          source: 'search',
        },
        {
          type: 'commit:copilot-coauthor',
          detail: '为这个功能还差点',
          weight: 1,
          source: 'search',
        },
        {
          type: 'commit:cursor-generated',
          detail: '从这边进行处理',
          weight: 1,
          source: 'search',
        },
        {
          type: 'commit:copilot-suggestion',
          detail: '对这个问题进行说明',
          weight: 1,
          source: 'search',
        },
      ],
      signal_score: 4,
      is_ai_coding_enthusiast: false,
      profile: makeProfile(),
    };
    const result = identifyCandidate(candidate);
    expect(result.signals.some((s) => s.type === 'commit:message-chinese')).toBe(true);
  });

  it('should detect pinyin name (Tier 4)', () => {
    const result = identifyCandidate(makeCandidate({ name: 'Zhang Wei' }));
    expect(result.signals.some((s) => s.type === 'name:pinyin')).toBe(true);
  });

  it('should not detect non-pinyin name as Tier 4', () => {
    const result = identifyCandidate(makeCandidate({ name: 'John Smith' }));
    expect(result.signals.some((s) => s.type === 'name:pinyin')).toBe(false);
  });

  it('should detect UTC+8 timezone pattern (Tier 4)', () => {
    // Create signals with timestamps concentrated in UTC+8 working hours
    const signals = Array.from({ length: 15 }, (_, i) => ({
      type: 'code:claude-md' as const,
      detail: `file-${String(i)}`,
      weight: 1,
      source: 'search',
      // 3am-12pm UTC = 11am-8pm UTC+8
      occurred_at: `2024-01-${String(i + 1).padStart(2, '0')}T${String(3 + (i % 10)).padStart(2, '0')}:00:00Z`,
    }));
    const candidate: Candidate = {
      username: 'testuser',
      signals,
      signal_score: 15,
      is_ai_coding_enthusiast: false,
      profile: makeProfile(),
    };
    const result = identifyCandidate(candidate);
    expect(result.signals.some((s) => s.type === 'timezone:utc-plus-8')).toBe(true);
  });

  it('should not detect timezone with non-UTC+8 pattern', () => {
    // Create signals with timestamps in US working hours (1pm-10pm UTC = 8am-5pm EST)
    const signals = Array.from({ length: 15 }, (_, i) => ({
      type: 'code:claude-md' as const,
      detail: `file-${String(i)}`,
      weight: 1,
      source: 'search',
      // 5pm-10pm UTC = non-China hours
      occurred_at: `2024-01-${String(i + 1).padStart(2, '0')}T${String(17 + (i % 4)).padStart(2, '0')}:00:00Z`,
    }));
    const candidate: Candidate = {
      username: 'testuser',
      signals,
      signal_score: 15,
      is_ai_coding_enthusiast: false,
      profile: makeProfile(),
    };
    const result = identifyCandidate(candidate);
    expect(result.signals.some((s) => s.type === 'timezone:utc-plus-8')).toBe(false);
  });

  it('should skip Tier 3/4 when Tier 1 already gives high confidence', () => {
    // With a Beijing location (Tier 1), Tier 3/4 should be skipped
    const repos = Array.from({ length: 3 }, (_, i) => ({
      name: `repo${String(i)}`,
      full_name: `testuser/repo${String(i)}`,
      description: '这是一个相当好的中文项目',
      stars: 10,
      forks: 1,
      language: 'TypeScript',
      topics: [],
      is_fork: false,
      updated_at: '2024-01-01T00:00:00Z',
    }));
    const result = identifyCandidate(makeCandidate({ location: 'Beijing', recent_repos: repos }));
    // Should have location Tier 1 but NOT have repo Tier 3
    expect(result.signals.some((s) => s.tier === 1)).toBe(true);
    expect(result.signals.some((s) => s.tier === 3)).toBe(false);
  });
});
