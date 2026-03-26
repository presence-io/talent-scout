import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { Checkpoint, findOrCreateRunDir } from '../src/checkpoint.js';

function makeTmpDir() {
  return join(tmpdir(), `talent-scout-ckpt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe('Checkpoint', () => {
  let tmpDir: string;
  let ckptPath: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
    ckptPath = join(tmpDir, '_checkpoint.json');
  });

  it('should start with empty state when no file exists', async () => {
    const ckpt = new Checkpoint(ckptPath);
    await ckpt.load();
    expect(ckpt.isComplete('step1')).toBe(false);
    expect(ckpt.get('step1')).toBeUndefined();
  });

  it('should mark and persist a step', async () => {
    const ckpt = new Checkpoint(ckptPath);
    await ckpt.load();
    await ckpt.mark('step1', { count: 42 });

    expect(ckpt.isComplete('step1')).toBe(true);
    expect(ckpt.get('step1') as { count: number }).toEqual({ count: 42 });

    // Verify persisted to disk
    const raw = await readFile(ckptPath, 'utf-8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    expect(data['step1']).toEqual({ count: 42 });
  });

  it('should reload persisted state from disk', async () => {
    const ckpt1 = new Checkpoint(ckptPath);
    await ckpt1.load();
    await ckpt1.mark('step1', ['user1', 'user2']);
    await ckpt1.mark('step2');

    // New instance reloads
    const ckpt2 = new Checkpoint(ckptPath);
    await ckpt2.load();
    expect(ckpt2.isComplete('step1')).toBe(true);
    expect(ckpt2.isComplete('step2')).toBe(true);
    expect(ckpt2.isComplete('step3')).toBe(false);
    expect(ckpt2.get('step1') as string[]).toEqual(['user1', 'user2']);
  });

  it('should mark with default true value', async () => {
    const ckpt = new Checkpoint(ckptPath);
    await ckpt.load();
    await ckpt.mark('done');
    expect(ckpt.get('done')).toBe(true);
  });

  it('should remove the checkpoint file', async () => {
    const ckpt = new Checkpoint(ckptPath);
    await ckpt.load();
    await ckpt.mark('step1');

    await ckpt.remove();

    // File should be gone — new load gives empty state
    const ckpt2 = new Checkpoint(ckptPath);
    await ckpt2.load();
    expect(ckpt2.isComplete('step1')).toBe(false);
  });

  it('should handle remove when file does not exist', async () => {
    const ckpt = new Checkpoint(join(tmpDir, 'nonexistent.json'));
    await expect(ckpt.remove()).resolves.toBeUndefined();
  });
});

describe('findOrCreateRunDir', () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = makeTmpDir();
    await mkdir(baseDir, { recursive: true });
  });

  it('should create a new timestamped directory when base is empty', async () => {
    const dir = await findOrCreateRunDir(baseDir);
    expect(dir).toContain(baseDir);

    const entries = await readdir(baseDir);
    expect(entries.length).toBe(1);
    // Timestamp format: 2025-01-01T0656 (ISO with colons/dots stripped, 15 chars)
    expect(entries[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{4}$/);
  });

  it('should resume an incomplete run', async () => {
    // Create an incomplete run directory
    const incompleteDir = join(baseDir, '20250101T120000');
    await mkdir(incompleteDir, { recursive: true });
    await writeFile(join(incompleteDir, 'partial.json'), '{}');

    const dir = await findOrCreateRunDir(baseDir);
    expect(dir).toBe(incompleteDir);
  });

  it('should skip completed runs and create new', async () => {
    // Create a completed run
    const completedDir = join(baseDir, '20250101T120000');
    await mkdir(completedDir, { recursive: true });
    await writeFile(join(completedDir, '.complete'), 'done');

    const dir = await findOrCreateRunDir(baseDir);
    expect(dir).not.toBe(completedDir);

    const entries = await readdir(baseDir);
    expect(entries.length).toBe(2);
  });

  it('should resume the most recent incomplete run', async () => {
    // Completed older run
    const older = join(baseDir, '20250101T100000');
    await mkdir(older, { recursive: true });
    await writeFile(join(older, '.complete'), 'done');

    // Incomplete newer run
    const newer = join(baseDir, '20250101T120000');
    await mkdir(newer, { recursive: true });

    const dir = await findOrCreateRunDir(baseDir);
    expect(dir).toBe(newer);
  });

  it('should create base directory if it does not exist', async () => {
    const deepBase = join(baseDir, 'a', 'b', 'c');
    const dir = await findOrCreateRunDir(deepBase);
    expect(dir).toContain(deepBase);
  });
});
