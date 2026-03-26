import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readJsonFile,
  writeJsonAtomic,
  resolveOutputDir,
  resolveUserDataDir,
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
