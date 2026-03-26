import { readFileSync, rmSync } from 'node:fs';
import { mkdir, mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findProjectRoot, loadDashboardConfig } from '../src/lib/dashboard-config.js';
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
  it('defaults to base/workspace-data/output', () => {
    expect(resolveOutputDir('/base')).toBe('/base/workspace-data/output/evaluated/latest');
  });
});

describe('resolveUserDataDir', () => {
  it('defaults to base/workspace-data/user-data', () => {
    expect(resolveUserDataDir('/base')).toBe('/base/workspace-data/user-data');
  });
});

describe('dashboard config', () => {
  it('finds project root by talents.yaml marker', async () => {
    await writeJsonAtomic(join(testDir, 'workspace-data', 'placeholder.json'), { ok: true });
    await writeJsonAtomic(join(testDir, 'nested', 'deep', 'placeholder.json'), { ok: true });
    await writeJsonAtomic(join(testDir, 'talents.yaml'), { ok: true });

    expect(findProjectRoot(join(testDir, 'nested', 'deep'))).toBe(testDir);
  });

  it('resolves output and user-data relative to discovered project root', async () => {
    await writeJsonAtomic(join(testDir, 'talents.yaml'), { ok: true });

    const config = loadDashboardConfig(join(testDir, 'packages', 'dashboard'));
    expect(config.projectRoot).toBe(testDir);
    expect(config.workspaceDir).toBe(join(testDir, 'workspace-data'));
    expect(config.outputDir).toBe(join(testDir, 'workspace-data', 'output', 'evaluated', 'latest'));
    expect(config.userDataDir).toBe(join(testDir, 'workspace-data', 'user-data'));
  });
});

describe('listRunHistory', () => {
  it('lists run directories sorted newest first', async () => {
    const evaluatedDir = join(testDir, 'workspace-data', 'output', 'evaluated');
    await mkdir(join(evaluatedDir, '20250101T000000'), { recursive: true });
    await mkdir(join(evaluatedDir, '20250102T000000'), { recursive: true });
    await symlink('20250102T000000', join(evaluatedDir, 'latest'));

    await writeJsonAtomic(join(testDir, 'talents.yaml'), { ok: true });
    const history = await listRunHistory(testDir);

    expect(history).toHaveLength(2);
    expect(history[0]?.timestamp).toBe('20250102T000000');
    expect(history[0]?.isLatest).toBe(true);
    expect(history[1]?.timestamp).toBe('20250101T000000');
    expect(history[1]?.isLatest).toBe(false);
  });

  it('marks latest correctly when the symlink target is absolute', async () => {
    const evaluatedDir = join(testDir, 'workspace-data', 'output', 'evaluated');
    const latestRunDir = join(evaluatedDir, '20250103T000000');
    await mkdir(latestRunDir, { recursive: true });
    await symlink(latestRunDir, join(evaluatedDir, 'latest'));
    await writeJsonAtomic(join(testDir, 'talents.yaml'), { ok: true });

    const history = await listRunHistory(testDir);

    expect(history).toHaveLength(1);
    expect(history[0]?.timestamp).toBe('20250103T000000');
    expect(history[0]?.isLatest).toBe(true);
  });

  it('returns empty array when no evaluated directory', async () => {
    await writeJsonAtomic(join(testDir, 'talents.yaml'), { ok: true });
    const history = await listRunHistory(testDir);
    expect(history).toEqual([]);
  });
});
