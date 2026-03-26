import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyPatches, loadPatches } from '../src/patches.js';

describe('loadPatches', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'patches-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it('returns empty array for nonexistent directory', async () => {
    const patches = await loadPatches('/nonexistent/path');
    expect(patches).toEqual([]);
  });

  it('parses valid patch files', async () => {
    await writeFile(
      join(dir, 'patch1.md'),
      `---
id: p1
target: scoring
applies_to: >=1.0.0
kind: override
priority: 5
---
Use weighted average instead of sum.
`
    );
    const patches = await loadPatches(dir);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({
      id: 'p1',
      target: 'scoring',
      kind: 'override',
      priority: 5,
    });
    expect(patches[0]?.content).toContain('Use weighted average');
  });

  it('ignores non-md files and invalid frontmatter', async () => {
    await writeFile(join(dir, 'readme.txt'), 'Not a patch');
    await writeFile(join(dir, 'bad.md'), 'No frontmatter at all');
    await writeFile(
      join(dir, 'incomplete.md'),
      `---
id: x
---
Missing required fields`
    );
    const patches = await loadPatches(dir);
    expect(patches).toEqual([]);
  });

  it('sorts patches by priority descending', async () => {
    const makePatch = (id: string, priority: number) =>
      `---\nid: ${id}\ntarget: eval\napplies_to: *\nkind: threshold\npriority: ${priority}\n---\ncontent`;
    await writeFile(join(dir, 'low.md'), makePatch('low', 1));
    await writeFile(join(dir, 'high.md'), makePatch('high', 10));
    await writeFile(join(dir, 'mid.md'), makePatch('mid', 5));
    const patches = await loadPatches(dir);
    expect(patches.map((p) => p.id)).toEqual(['high', 'mid', 'low']);
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
