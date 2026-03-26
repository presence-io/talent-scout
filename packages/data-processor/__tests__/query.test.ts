import { describe, it, expect, vi, beforeEach } from 'vitest';

import { loadProcessedCandidates, loadIdentityResults } from '../src/query.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

const mockReadFile = vi.mocked((await import('node:fs/promises')).readFile);

describe('loadProcessedCandidates', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads and parses merged.json', async () => {
    const data = { alice: { username: 'alice', signals: [] } };
    mockReadFile.mockResolvedValue(JSON.stringify(data));

    const result = await loadProcessedCandidates('/output/processed/latest');
    expect(result).toEqual(data);
    expect(mockReadFile).toHaveBeenCalledWith('/output/processed/latest/merged.json', 'utf-8');
  });
});

describe('loadIdentityResults', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads and parses identity.json', async () => {
    const data = { alice: { china_confidence: 0.9, city: 'Beijing', signals: [] } };
    mockReadFile.mockResolvedValue(JSON.stringify(data));

    const result = await loadIdentityResults('/output/processed/latest');
    expect(result).toEqual(data);
    expect(mockReadFile).toHaveBeenCalledWith('/output/processed/latest/identity.json', 'utf-8');
  });
});
