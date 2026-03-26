import { readFileSync, rmSync } from 'node:fs';
import { mkdir, mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  listRunHistory,
  readJsonFile,
  resolveOutputDir,
  resolveUserDataDir,
  writeJsonAtomic,
} from '../src/lib/file.js';

let testDir: string;
beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'talent-dash-'));
});
afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('readJsonFile', () => {
  it('reads valid JSON', async () => {
    const filePath = join(testDir, 'data.json');
    await writeJsonAtomic(filePath, { hello: 'world' });
    const result = await readJsonFile(filePath, {});
    expect(result).toEqual({ hello: 'world' });
  });

  it('returns fallback for missing file', async () => {
    const result = await readJsonFile(join(testDir, 'nope.json'), []);
    expect(result).toEqual([]);
  });
});

describe('writeJsonAtomic', () => {
  it('creates parent directories', async () => {
    const filePath = join(testDir, 'sub', 'deep', 'data.json');
    await writeJsonAtomic(filePath, { x: 1 });
    const raw = readFileSync(filePath, 'utf-8');
    expect(JSON.parse(raw)).toEqual({ x: 1 });
  });
});

describe('resolveOutputDir', () => {
  it('uses TALENT_OUTPUT_DIR env if set', () => {
    const orig = process.env['TALENT_OUTPUT_DIR'];
    process.env['TALENT_OUTPUT_DIR'] = '/custom/out';
    expect(resolveOutputDir('/base')).toBe('/custom/out');
    if (orig === undefined) {
      delete process.env['TALENT_OUTPUT_DIR'];
    } else {
      process.env['TALENT_OUTPUT_DIR'] = orig;
    }
  });

  it('defaults to base/output', () => {
    const orig = process.env['TALENT_OUTPUT_DIR'];
    delete process.env['TALENT_OUTPUT_DIR'];
    expect(resolveOutputDir('/base')).toBe('/base/output/evaluated/latest');
    if (orig !== undefined) {
      process.env['TALENT_OUTPUT_DIR'] = orig;
    }
  });
});

describe('resolveUserDataDir', () => {
  it('defaults to base/user-data', () => {
    const orig = process.env['TALENT_USER_DATA_DIR'];
    delete process.env['TALENT_USER_DATA_DIR'];
    expect(resolveUserDataDir('/base')).toBe('/base/user-data');
    if (orig !== undefined) {
      process.env['TALENT_USER_DATA_DIR'] = orig;
    }
  });
});

describe('listRunHistory', () => {
  it('lists run directories sorted newest first', async () => {
    const evaluatedDir = join(testDir, 'output', 'evaluated');
    await mkdir(join(evaluatedDir, '20250101T000000'), { recursive: true });
    await mkdir(join(evaluatedDir, '20250102T000000'), { recursive: true });
    await symlink('20250102T000000', join(evaluatedDir, 'latest'));

    const orig = process.env['TALENT_OUTPUT_DIR'];
    process.env['TALENT_OUTPUT_DIR'] = join(evaluatedDir, 'latest');
    const history = await listRunHistory(testDir);
    if (orig === undefined) {
      delete process.env['TALENT_OUTPUT_DIR'];
    } else {
      process.env['TALENT_OUTPUT_DIR'] = orig;
    }

    expect(history).toHaveLength(2);
    expect(history[0]?.timestamp).toBe('20250102T000000');
    expect(history[0]?.isLatest).toBe(true);
    expect(history[1]?.timestamp).toBe('20250101T000000');
    expect(history[1]?.isLatest).toBe(false);
  });

  it('returns empty array when no evaluated directory', async () => {
    const orig = process.env['TALENT_OUTPUT_DIR'];
    process.env['TALENT_OUTPUT_DIR'] = join(testDir, 'output', 'evaluated', 'latest');
    const history = await listRunHistory(testDir);
    if (orig === undefined) {
      delete process.env['TALENT_OUTPUT_DIR'];
    } else {
      process.env['TALENT_OUTPUT_DIR'] = orig;
    }
    expect(history).toEqual([]);
  });
});
