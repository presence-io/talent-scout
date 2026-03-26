import { describe, it, expect, vi, beforeEach } from 'vitest';

import { cronStatus } from '../src/cron.js';
import * as shared from '@talent-scout/shared';

vi.mock('@talent-scout/shared', async () => {
  const actual =
    await vi.importActual<typeof import('@talent-scout/shared')>('@talent-scout/shared');
  return {
    ...actual,
    loadConfig: vi.fn(),
    syncCronJobs: vi.fn(),
  };
});

describe('cronStatus', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('displays configured cron jobs', async () => {
    const mockConfig = {
      openclaw: {
        cron: [
          {
            name: 'test-job',
            schedule: '0 1 * * *',
            command: 'echo hello',
            description: 'Test job',
          },
        ],
        agents: {},
        batch_size: 10,
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
      identity: { min_confidence: 0.5, ai_assist_range: [0.3, 0.7] as [number, number] },
      evaluation: {
        weights: { skill: 0.35, ai_depth: 0.3, reachability: 0.15, fit: 0.2 },
        activity_penalty: -3,
        activity_threshold: 10,
        max_ai_evaluations: 200,
      },
      target_profile: { preferred_cities: [], preferred_languages: [] },
      cache: {
        ttl: {
          user_profile: 604800,
          user_repos: 259200,
          search_results: 86400,
          events: 43200,
          rankings: 2592000,
        },
      },
    };
    vi.mocked(shared.loadConfig).mockResolvedValue(mockConfig);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await cronStatus();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('test-job');
    expect(output).toContain('0 1 * * *');
    consoleSpy.mockRestore();
  });

  it('shows message when no cron jobs configured', async () => {
    const mockConfig = {
      openclaw: { cron: [], agents: {}, batch_size: 10 },
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
      identity: { min_confidence: 0.5, ai_assist_range: [0.3, 0.7] as [number, number] },
      evaluation: {
        weights: { skill: 0.35, ai_depth: 0.3, reachability: 0.15, fit: 0.2 },
        activity_penalty: -3,
        activity_threshold: 10,
        max_ai_evaluations: 200,
      },
      target_profile: { preferred_cities: [], preferred_languages: [] },
      cache: {
        ttl: {
          user_profile: 604800,
          user_repos: 259200,
          search_results: 86400,
          events: 43200,
          rankings: 2592000,
        },
      },
    };
    vi.mocked(shared.loadConfig).mockResolvedValue(mockConfig);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await cronStatus();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('No cron jobs configured');
    consoleSpy.mockRestore();
  });
});
