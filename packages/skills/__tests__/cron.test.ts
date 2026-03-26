import * as shared from '@talent-scout/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cronDisable, cronEnable, cronRun, cronRuns, cronStatus, cronSync } from '../src/cron.js';

vi.mock('@talent-scout/shared', async () => {
  const actual =
    await vi.importActual<typeof import('@talent-scout/shared')>('@talent-scout/shared');
  return {
    ...actual,
    loadConfig: vi.fn(),
    syncCronJobs: vi.fn(),
    cronRuns: vi.fn(),
    cronRun: vi.fn(),
    cronDisable: vi.fn(),
    cronEnable: vi.fn(),
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
      identity: {
        min_confidence: 0.5,
        ai_assist_range: [0.3, 0.7] as [number, number],
      },
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
    vi.mocked(shared.loadConfig).mockResolvedValue(shared.TalentConfigSchema.parse(mockConfig));

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
      identity: {
        min_confidence: 0.5,
        ai_assist_range: [0.3, 0.7] as [number, number],
      },
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
    vi.mocked(shared.loadConfig).mockResolvedValue(shared.TalentConfigSchema.parse(mockConfig));

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await cronStatus();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('No cron jobs configured');
    consoleSpy.mockRestore();
  });
});

describe('cronSync', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls syncCronJobs and logs progress', async () => {
    vi.mocked(shared.loadConfig).mockResolvedValue(
      shared.TalentConfigSchema.parse({ openclaw: { cron: [], agents: {}, batch_size: 10 } })
    );
    vi.mocked(shared.syncCronJobs).mockResolvedValue();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await cronSync();
    expect(shared.syncCronJobs).toHaveBeenCalledOnce();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Syncing cron jobs');
    expect(output).toContain('synced');
    consoleSpy.mockRestore();
  });
});

describe('cronRuns', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed run history from openclaw', async () => {
    const mockRuns = [
      { name: 'talent-collect', status: 'success', started_at: '2024-01-01T00:00:00Z' },
    ];
    vi.mocked(shared.cronRuns).mockResolvedValue(mockRuns);
    const runs = await cronRuns();
    expect(runs).toEqual(mockRuns);
    expect(shared.cronRuns).toHaveBeenCalledOnce();
  });
});

describe('cronRun', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns details for a specific cron run', async () => {
    const mockRun = { name: 'talent-collect', status: 'success' };
    vi.mocked(shared.cronRun).mockResolvedValue(mockRun);
    const run = await cronRun('talent-collect');
    expect(run).toEqual(mockRun);
    expect(shared.cronRun).toHaveBeenCalledWith('talent-collect');
  });
});

describe('cronDisable', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls shared cronDisable and logs confirmation', async () => {
    vi.mocked(shared.loadConfig).mockResolvedValue(
      shared.TalentConfigSchema.parse({ openclaw: { cron: [], agents: {}, batch_size: 10 } })
    );
    vi.mocked(shared.cronDisable).mockResolvedValue();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await cronDisable('talent-collect');
    expect(shared.cronDisable).toHaveBeenCalledWith('talent-collect');
    expect(consoleSpy.mock.calls.some((c) => String(c[0]).includes('disabled'))).toBe(true);
    consoleSpy.mockRestore();
  });
});

describe('cronEnable', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls shared cronEnable and logs confirmation', async () => {
    vi.mocked(shared.loadConfig).mockResolvedValue(
      shared.TalentConfigSchema.parse({ openclaw: { cron: [], agents: {}, batch_size: 10 } })
    );
    vi.mocked(shared.cronEnable).mockResolvedValue();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await cronEnable('talent-collect');
    expect(shared.cronEnable).toHaveBeenCalledWith('talent-collect');
    expect(consoleSpy.mock.calls.some((c) => String(c[0]).includes('enabled'))).toBe(true);
    consoleSpy.mockRestore();
  });
});
