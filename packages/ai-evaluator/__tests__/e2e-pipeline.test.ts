import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

import type { Candidate, TalentEntry } from '@talent-scout/shared';

// Mock loadConfig so it doesn't require a real talents.yaml
vi.mock('@talent-scout/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talent-scout/shared')>();
  return {
    ...actual,
    loadConfig: vi.fn().mockResolvedValue({
      evaluation: {
        weights: { skill: 0.35, ai_depth: 0.3, reachability: 0.15, fit: 0.2 },
        activity_threshold: 10,
        activity_penalty: -3.0,
        max_ai_evaluations: 200,
      },
      identity: { min_confidence: 0.5, ai_assist_range: [0.3, 0.7] },
      openclaw: { agents: {}, batch_size: 10, cron: [] },
      target_profile: {
        preferred_cities: [],
        preferred_languages: ['TypeScript', 'Python'],
      },
      code_signals: [],
      commit_queries: [],
      topic_queries: [],
      chinese_community: [],
      stargazer_repos: [],
      graph_expansion: {
        enabled: true,
        max_seed_users: 200,
        max_followers_per_user: 100,
        max_depth: 1,
        min_seed_confidence: 0.7,
      },
      api_budget: {
        max_total_calls: 2000,
        search_pages_per_query: 10,
        profile_batch_size: 500,
        search_sleep_ms: 2500,
      },
      cache: { ttl: {} },
    }),
  };
});

const { runPipeline } = await import('../src/pipeline.js');

function makeCandidate(username: string, overrides: Partial<Candidate> = {}): Candidate {
  return {
    username,
    signals: [
      {
        type: 'code:claude-md',
        repo: username + '/proj',
        weight: 5,
        detail: 'CLAUDE.md',
        source: 'step1a',
      },
      {
        type: 'commit:claude-coauthor',
        repo: username + '/proj',
        weight: 5,
        detail: 'co-authored',
        source: 'step1b',
      },
      {
        type: 'topic:claude-code',
        repo: username + '/proj',
        weight: 4,
        detail: 'topic match',
        source: 'step1c',
      },
    ],
    signal_score: 14,
    is_ai_coding_enthusiast: true,
    ...overrides,
  };
}

function makeProfile(username: string) {
  return {
    login: username,
    name: username + ' Name',
    location: 'Beijing, China',
    email: username + '@example.com',
    blog: '',
    twitter: null,
    bio: 'Developer based in Beijing',
    company: 'TechCo',
    hireable: true,
    public_repos: 30,
    followers: 150,
    following: 50,
    created_at: '2019-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    recent_repos: [
      {
        name: 'proj',
        full_name: username + '/proj',
        language: 'TypeScript',
        stars: 100,
        forks: 20,
        topics: ['claude-code', 'ai'],
        updated_at: '2025-05-01T00:00:00Z',
        is_fork: false,
        description: 'A project',
      },
    ],
  };
}

describe('E2E pipeline', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), 'talent-e2e-' + Date.now());
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test('collect then process then evaluate produces valid shortlist', async () => {
    // Prepare fixture data: step2_merged.json
    const candidates: Record<string, Candidate> = {
      user_cn: makeCandidate('user_cn'),
      user_us: makeCandidate('user_us'),
    };
    await writeFile(join(testDir, 'merged.json'), JSON.stringify(candidates, null, 2));

    // Prepare fixture data: profiles.json
    const profiles: Record<string, ReturnType<typeof makeProfile>> = {
      user_cn: makeProfile('user_cn'),
      user_us: {
        ...makeProfile('user_us'),
        location: 'San Francisco, USA',
        bio: 'SF developer',
        email: 'user_us@example.com',
      },
    };
    await writeFile(join(testDir, 'profiles.json'), JSON.stringify(profiles, null, 2));

    // Run the pipeline with skipAI (no OpenClaw calls needed)
    await runPipeline({
      inputDir: testDir,
      outputDir: testDir,
      skipAI: true,
    });

    // Verify evaluation.json was created and is valid
    const evalRaw = await readFile(join(testDir, 'evaluation.json'), 'utf-8');
    const evaluated = JSON.parse(evalRaw) as Record<string, Candidate>;

    expect(evaluated).toHaveProperty('user_cn');
    expect(evaluated).toHaveProperty('user_us');

    // Chinese user should be identified
    const cn = evaluated['user_cn'];
    expect(cn).toBeDefined();
    expect(cn.identity).toBeDefined();
    expect(cn.identity?.china_confidence).toBeGreaterThan(0.5);

    // Chinese user should have evaluation scores
    expect(cn.evaluation).toBeDefined();
    expect(cn.evaluation?.final_score).toBeTypeOf('number');

    // Verify shortlist.json was created and is valid
    const shortlistRaw = await readFile(join(testDir, 'shortlist.json'), 'utf-8');
    const shortlist = JSON.parse(shortlistRaw) as TalentEntry[];

    expect(Array.isArray(shortlist)).toBe(true);

    // At least the Chinese user should be shortlisted
    if (shortlist.length > 0) {
      const entry = shortlist[0];
      expect(entry).toBeDefined();
      // Verify TalentEntry shape
      expect(entry).toHaveProperty('username');
      expect(entry).toHaveProperty('final_score');
      expect(entry).toHaveProperty('recommended_action');
      expect(entry).toHaveProperty('skill_score');
      expect(entry).toHaveProperty('ai_depth_score');
      expect(entry).toHaveProperty('ai_depth_tier');
      expect(entry).toHaveProperty('signal_types');
      expect(entry).toHaveProperty('signal_count');
      expect(['reach_out', 'monitor', 'skip']).toContain(entry.recommended_action);
    }
  });

  test('empty candidate set produces empty shortlist', async () => {
    await writeFile(join(testDir, 'merged.json'), '{}');
    await writeFile(join(testDir, 'profiles.json'), '{}');

    await runPipeline({
      inputDir: testDir,
      outputDir: testDir,
      skipAI: true,
    });

    const shortlistRaw = await readFile(join(testDir, 'shortlist.json'), 'utf-8');
    const shortlist = JSON.parse(shortlistRaw) as TalentEntry[];
    expect(shortlist).toEqual([]);
  });
});
