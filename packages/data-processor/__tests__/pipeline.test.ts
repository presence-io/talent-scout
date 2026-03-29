import { mkdir, mkdtemp, readFile, readlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runProcessPipeline } from '../src/pipeline.js';

vi.mock('@talent-scout/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talent-scout/shared')>();
  return {
    ...actual,
    ghApi: vi.fn(),
    ghApiSingle: vi.fn(),
    loadConfig: vi.fn(),
    readIgnoreList: vi.fn(),
  };
});

const shared = await import('@talent-scout/shared');
const mockGhApi = vi.mocked(shared.ghApi);
const mockGhApiSingle = vi.mocked(shared.ghApiSingle);
const mockLoadConfig = vi.mocked(shared.loadConfig);
const mockReadIgnoreList = vi.mocked(shared.readIgnoreList);

describe('runProcessPipeline', () => {
  let baseDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();

    baseDir = await mkdtemp(join(tmpdir(), 'process-pipeline-'));

    const config = shared.TalentConfigSchema.parse({
      api_budget: {
        profile_batch_size: 2,
        search_sleep_ms: 0,
      },
      identity: {
        min_confidence: 0.2,
        ai_assist_range: [0.3, 0.7],
      },
      graph_expansion: {
        enabled: false,
      },
    });

    mockLoadConfig.mockResolvedValue(config);
    mockReadIgnoreList.mockResolvedValue({
      ignoreddev: {
        reason: 'test ignore',
        ignored_at: '2026-03-26T00:00:00.000Z',
      },
    });
    mockGhApiSingle.mockImplementation(async (path) => {
      if (path === '/users/andeya') {
        return {
          login: 'andeya',
          name: 'Andeya',
          location: 'Shenzhen, China',
          email: 'andeya@example.com',
          blog: 'https://andeya.dev',
          twitter_username: 'andeya',
          bio: 'Builder',
          company: '@ByteDance',
          hireable: true,
          public_repos: 42,
          followers: 256,
          following: 32,
          created_at: '2020-01-01T00:00:00.000Z',
          updated_at: '2026-03-26T00:00:00.000Z',
        };
      }

      return null;
    });
    mockGhApi.mockResolvedValue([
      {
        name: 'claude-code-playground',
        full_name: 'andeya/claude-code-playground',
        description: 'AI coding experiments',
        stargazers_count: 128,
        forks_count: 16,
        language: 'TypeScript',
        topics: ['ai', 'claude-code'],
        fork: false,
        updated_at: '2026-03-26T00:00:00.000Z',
      },
    ]);
  });

  it('hydrates profiles, filters ignored users, and writes processed outputs', async () => {
    const rawDir = join(baseDir, 'workspace-data', 'output', 'raw', '2026-03-26T1246');
    await mkdir(rawDir, { recursive: true });
    await writeFile(
      join(rawDir, 'rankings.json'),
      JSON.stringify({
        candidates: {
          andeya: [
            {
              type: 'seed:ranking',
              detail: 'Listed in china-ranking',
              weight: 4,
              source: 'ranking:china-ranking',
            },
          ],
          ignoreddev: [
            {
              type: 'seed:list',
              detail: 'Listed in seed list',
              weight: 4,
              source: 'seed:list',
            },
          ],
          'dependabot[bot]': [
            {
              type: 'community:contributor',
              detail: 'Opened maintenance PR',
              weight: 1,
              source: 'community:test',
            },
          ],
        },
      })
    );

    const result = await runProcessPipeline({ baseDir });

    expect(result.rawDir).toBe(rawDir);
    expect(result.candidateCount).toBe(2);
    expect(result.identifiedCount).toBe(1);
    expect(result.fetchedProfiles).toBe(1);
    expect(mockGhApiSingle).toHaveBeenCalledTimes(1);
    expect(mockGhApiSingle).toHaveBeenCalledWith(
      '/users/andeya',
      expect.objectContaining({ cacheTtl: 604800 })
    );

    const merged = JSON.parse(
      await readFile(join(result.outputDir, 'merged.json'), 'utf-8')
    ) as Record<string, { profile?: { location?: string } }>;
    expect(Object.keys(merged).sort()).toEqual(['andeya', 'dependabot[bot]']);
    expect(merged['andeya']?.profile?.location).toBe('Shenzhen, China');

    const profiles = JSON.parse(
      await readFile(join(result.outputDir, 'profiles.json'), 'utf-8')
    ) as Record<string, { recent_repos: Array<{ full_name: string }> }>;
    expect(Object.keys(profiles)).toEqual(['andeya']);
    expect(profiles['andeya']?.recent_repos[0]?.full_name).toBe('andeya/claude-code-playground');

    const scored = JSON.parse(
      await readFile(join(result.outputDir, 'scored.json'), 'utf-8')
    ) as Record<string, unknown>;
    expect(Object.keys(scored)).toEqual(['andeya']);

    const latestLink = join(baseDir, 'workspace-data', 'output', 'processed', 'latest');
    expect(await readlink(latestLink)).toBe(result.outputDir);
  });

  it('throws when no raw collection directory exists', async () => {
    await mkdir(join(baseDir, 'workspace-data', 'output', 'raw'), { recursive: true });

    await expect(runProcessPipeline({ baseDir })).rejects.toThrow(/No raw data directories found/);
  });
});
