import { describe, it, expect } from 'vitest';

import type { Candidate, GitHubProfile } from '@talent-scout/shared';
import {
  identifyCandidate,
  computeChinaConfidence,
  containsSimplifiedChinese,
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
      { tier: 1, type: 'location:explicit', confidence: 0.92, evidence: 'test' },
    ]);
    expect(result).toBe(0.95);
  });

  it('should use noisy-or for Tier 2+ signals', () => {
    const result = computeChinaConfidence([
      { tier: 2, type: 'bio:simplified-chinese', confidence: 0.75, evidence: 'test' },
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
      }),
    );
    expect(result.china_confidence).toBe(0);
    expect(result.signals).toHaveLength(0);
  });

  it('should combine multiple Tier 2 signals', () => {
    const result = identifyCandidate(
      makeCandidate({
        company: '@Tencent',
        blog: 'https://mysite.cn',
      }),
    );
    // Two Tier 2 signals should combine
    expect(result.signals.length).toBeGreaterThanOrEqual(2);
    expect(result.china_confidence).toBeGreaterThan(0.7);
  });
});
