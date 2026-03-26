import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadRawSignals } from '../src/query.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
}));

const fsMock = vi.mocked(await import('node:fs/promises'));

describe('loadRawSignals', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads and merges all JSON files in directory', async () => {
    fsMock.readdir.mockResolvedValue([
      'github-signals.json',
      'community.json',
    ] as unknown as Awaited<ReturnType<typeof fsMock.readdir>>);

    fsMock.readFile.mockImplementation(async (path: unknown) => {
      if ((path as string).includes('github-signals.json')) {
        return JSON.stringify({
          candidates: { alice: [{ type: 'code_signal', source: 'search' }] },
        });
      }
      return JSON.stringify({
        candidates: {
          alice: [{ type: 'community_member', source: 'repo' }],
          bob: [{ type: 'community_member', source: 'repo' }],
        },
      });
    });

    const result = await loadRawSignals('/output/raw/20250101T000000');
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['alice']).toHaveLength(2);
    expect(result['bob']).toHaveLength(1);
  });

  it('returns empty object for empty directory', async () => {
    fsMock.readdir.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof fsMock.readdir>>);

    const result = await loadRawSignals('/output/raw/empty');
    expect(result).toEqual({});
  });
});
