import { FileCache, type TalentConfig, TalentConfigSchema } from '@talent-scout/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock execa to avoid real API calls
vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ stdout: '[]' }),
}));

// Import after mocks are set up
const { collectCodeSignals, collectCommitSignals, collectTopicSignals } =
  await import('../src/github-signals.js');
const { collectCommunitySignals } = await import('../src/community.js');
const { collectStargazerSignals } = await import('../src/stargazers.js');

function makeConfig(overrides: Partial<TalentConfig> = {}): TalentConfig {
  return TalentConfigSchema.parse(overrides);
}

function makeMockCache(): FileCache {
  const cache = new FileCache('/tmp/talent-scout-test-nonexistent');
  return cache;
}

describe('collectCodeSignals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty map with no code_signals configured', async () => {
    const config = makeConfig({ code_signals: [] });
    const cache = makeMockCache();
    const result = await collectCodeSignals(config, cache);
    expect(result.size).toBe(0);
  });

  it('should map labels to correct signal types', async () => {
    const { execa } = await import('execa');
    const mockExeca = vi.mocked(execa);

    // Mock gh api to return a search result
    mockExeca.mockResolvedValueOnce({
      stdout: JSON.stringify({
        total_count: 1,
        items: [
          {
            repository: {
              owner: { login: 'TestUser' },
              full_name: 'TestUser/repo',
            },
          },
        ],
      }),
    } as never);

    const config = makeConfig({
      code_signals: [
        {
          filename: 'CLAUDE.md',
          path: '/',
          weight: 2.0,
          label: 'code:claude-md',
        },
      ],
    });
    const cache = makeMockCache();
    const result = await collectCodeSignals(config, cache);

    expect(result.size).toBe(1);
    expect(result.has('testuser')).toBe(true);
    const signals = result.get('testuser');
    expect(signals).toHaveLength(1);
    expect(signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'code:claude-md',
          weight: 2.0,
        }),
      ])
    );
  });
});

describe('collectCommitSignals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty map with no commit_queries configured', async () => {
    const config = makeConfig({ commit_queries: [] });
    const cache = makeMockCache();
    const result = await collectCommitSignals(config, cache);
    expect(result.size).toBe(0);
  });
});

describe('collectTopicSignals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty map with no topic_queries configured', async () => {
    const config = makeConfig({ topic_queries: [] });
    const cache = makeMockCache();
    const result = await collectTopicSignals(config, cache);
    expect(result.size).toBe(0);
  });
});

describe('collectCommunitySignals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty map with no chinese_community configured', async () => {
    const config = makeConfig({ chinese_community: [] });
    const cache = makeMockCache();
    const result = await collectCommunitySignals(config, cache);
    expect(result.size).toBe(0);
  });
});

describe('collectStargazerSignals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty map with no stargazer_repos configured', async () => {
    const config = makeConfig({ stargazer_repos: [] });
    const cache = makeMockCache();
    const result = await collectStargazerSignals(config, cache);
    expect(result.size).toBe(0);
  });
});
