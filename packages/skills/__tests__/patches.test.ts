import { describe, it, expect } from 'vitest';

import { loadPatches, applyPatches } from '../src/patches.js';

describe('loadPatches', () => {
  it('returns empty array for nonexistent directory', async () => {
    const patches = await loadPatches('/nonexistent/path');
    expect(patches).toEqual([]);
  });
});

describe('applyPatches', () => {
  it('returns formatted overlay entries', () => {
    const patches = [
      {
        id: 'p1',
        target: 'identity',
        applies_to: '>=0.1.0',
        kind: 'threshold',
        priority: 10,
        content: 'Increase min confidence to 0.6',
      },
    ];
    const result = applyPatches([], patches);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('[threshold:identity]');
    expect(result[0]).toContain('Increase min confidence');
  });
});
