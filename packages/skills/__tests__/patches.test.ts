import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyPatches,
  loadPatches,
  satisfiesVersion,
  writeAppliedManifest,
} from '../src/patches.js';

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
  it('returns formatted overlay entries for compatible patches', () => {
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
    const { applied, skipped } = applyPatches([], patches, '1.0.0');
    expect(applied).toHaveLength(1);
    expect(applied[0]).toContain('[threshold:identity]');
    expect(applied[0]).toContain('Increase min confidence');
    expect(skipped).toHaveLength(0);
  });

  it('skips incompatible patches and warns', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const patches = [
      {
        id: 'p1',
        target: 'scoring',
        applies_to: '>=2.0.0',
        kind: 'override',
        priority: 10,
        content: 'New scoring logic',
      },
    ];
    const { applied, skipped } = applyPatches([], patches, '1.0.0');
    expect(applied).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.id).toBe('p1');
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('applies wildcard patches to any version', () => {
    const patches = [
      {
        id: 'p1',
        target: 'eval',
        applies_to: '*',
        kind: 'threshold',
        priority: 5,
        content: 'Always applies',
      },
    ];
    const { applied } = applyPatches([], patches, '0.0.1');
    expect(applied).toHaveLength(1);
  });
});

describe('satisfiesVersion', () => {
  it('wildcard matches everything', () => {
    expect(satisfiesVersion('1.0.0', '*')).toBe(true);
    expect(satisfiesVersion('0.0.1', '*')).toBe(true);
  });

  it('exact match', () => {
    expect(satisfiesVersion('1.0.0', '1.0.0')).toBe(true);
    expect(satisfiesVersion('1.0.1', '1.0.0')).toBe(false);
  });

  it('>= constraint', () => {
    expect(satisfiesVersion('2.0.0', '>=1.0.0')).toBe(true);
    expect(satisfiesVersion('1.0.0', '>=1.0.0')).toBe(true);
    expect(satisfiesVersion('0.9.0', '>=1.0.0')).toBe(false);
    expect(satisfiesVersion('1.1.0', '>=1.0.0')).toBe(true);
  });
});

describe('writeAppliedManifest', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'manifest-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it('writes applied.json with correct structure', async () => {
    await writeAppliedManifest(
      dir,
      ['[threshold:identity] content'],
      [
        {
          id: 'p2',
          target: 'scoring',
          applies_to: '>=2.0.0',
          kind: 'override',
          priority: 5,
          content: 'skipped',
        },
      ]
    );
    const raw = await readFile(join(dir, 'applied.json'), 'utf-8');
    const record = JSON.parse(raw);
    expect(record.patches).toEqual(['[threshold:identity] content']);
    expect(record.skipped).toEqual(['p2']);
    expect(record.applied_at).toBeDefined();
  });
});
