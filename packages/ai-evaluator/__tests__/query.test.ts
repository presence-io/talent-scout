import { describe, it, expect, vi, beforeEach } from 'vitest';

import { loadShortlist, loadEvaluation, loadRunStats } from '../src/query.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

const mockReadFile = vi.mocked((await import('node:fs/promises')).readFile);

describe('loadShortlist', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads and parses shortlist.json', async () => {
    const data = [{ username: 'alice', final_score: 85 }];
    mockReadFile.mockResolvedValue(JSON.stringify(data));

    const result = await loadShortlist('/output/evaluated/latest');
    expect(result).toEqual(data);
    expect(mockReadFile).toHaveBeenCalledWith('/output/evaluated/latest/shortlist.json', 'utf-8');
  });
});

describe('loadEvaluation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads and parses evaluation.json', async () => {
    const data = { alice: { username: 'alice', signals: [] } };
    mockReadFile.mockResolvedValue(JSON.stringify(data));

    const result = await loadEvaluation('/output/evaluated/latest');
    expect(result).toEqual(data);
    expect(mockReadFile).toHaveBeenCalledWith('/output/evaluated/latest/evaluation.json', 'utf-8');
  });
});

describe('loadRunStats', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads stats.json when available', async () => {
    const stats = {
      total_candidates: 10,
      identified_chinese: 5,
      evaluated: 5,
      reach_out: 2,
      monitor: 2,
      skip: 1,
      avg_skill_score: 70,
      avg_ai_depth_score: 60,
      run_at: '2025-01-01T00:00:00Z',
    };
    mockReadFile.mockResolvedValue(JSON.stringify(stats));

    const result = await loadRunStats('/output/evaluated/latest');
    expect(result).toEqual(stats);
    expect(mockReadFile).toHaveBeenCalledWith('/output/evaluated/latest/stats.json', 'utf-8');
  });

  it('computes stats from evaluation.json when stats.json is missing', async () => {
    mockReadFile.mockImplementation(async (path: unknown) => {
      if ((path as string).includes('stats.json')) {
        throw new Error('ENOENT');
      }
      return JSON.stringify({
        alice: {
          username: 'alice',
          signals: [],
          identity: { china_confidence: 0.9, city: null, signals: [] },
          evaluation: {
            skill_score: 80,
            ai_depth_score: 70,
            ai_depth_tier: 'builder',
            reachability_score: 60,
            fit_score: 50,
            final_score: 65,
            recommended_action: 'reach_out',
            summary: '',
          },
        },
      });
    });

    const result = await loadRunStats('/output/evaluated/latest');
    expect(result.total_candidates).toBe(1);
    expect(result.identified_chinese).toBe(1);
    expect(result.evaluated).toBe(1);
    expect(result.reach_out).toBe(1);
  });
});
