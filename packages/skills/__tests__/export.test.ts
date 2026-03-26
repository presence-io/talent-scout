import AdmZip from 'adm-zip';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EXPORT_WORKSPACE_USAGE, runExportWorkspaceCommand } from '../src/export.js';

describe('runExportWorkspaceCommand', () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), 'talent-scout-export-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('prints usage for --help', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runExportWorkspaceCommand(['--help']);

    expect(consoleSpy).toHaveBeenCalledWith(EXPORT_WORKSPACE_USAGE);
    consoleSpy.mockRestore();
  });

  it('creates a workspace-data zip and returns its path', async () => {
    const workspaceDir = join(tempDir, 'workspace-data');
    await mkdir(join(workspaceDir, 'output', 'evaluated', 'latest'), { recursive: true });
    await mkdir(join(workspaceDir, 'user-data'), { recursive: true });
    await writeFile(join(workspaceDir, 'output', 'evaluated', 'latest', 'shortlist.json'), '[]');

    const archivePath = await runExportWorkspaceCommand(['--workspace', workspaceDir]);

    expect(archivePath).not.toBe('');
    expect(existsSync(archivePath)).toBe(true);

    const zip = new AdmZip(archivePath);
    expect(zip.getEntry('workspace-data/output/evaluated/latest/shortlist.json')).toBeDefined();
    expect(zip.getEntry('workspace-data/talents.yaml')).toBeDefined();
  });

  it('accepts a project root that contains workspace-data', async () => {
    const workspaceDir = join(tempDir, 'workspace-data');
    await mkdir(workspaceDir, { recursive: true });

    const archivePath = await runExportWorkspaceCommand(['--workspace', tempDir]);

    expect(existsSync(archivePath)).toBe(true);
  });

  it('supports an explicit output path', async () => {
    const workspaceDir = join(tempDir, 'workspace-data');
    await mkdir(workspaceDir, { recursive: true });
    const outputPath = join(tempDir, 'exports', 'custom-workspace.zip');

    const archivePath = await runExportWorkspaceCommand([
      '--workspace',
      workspaceDir,
      '--output',
      outputPath,
    ]);

    expect(archivePath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);
  });

  it('rejects when a project root does not contain workspace-data', async () => {
    const projectRoot = join(tempDir, 'project-root');
    await mkdir(projectRoot, { recursive: true });

    await expect(runExportWorkspaceCommand(['--workspace', projectRoot])).rejects.toThrow(
      `Workspace directory not found: ${join(projectRoot, 'workspace-data')}`
    );
  });

  it('rejects unknown CLI options', async () => {
    await expect(runExportWorkspaceCommand(['--unknown'])).rejects.toThrow(
      'Unknown option: --unknown'
    );
  });

  it('rejects missing workspace directories', async () => {
    await expect(
      runExportWorkspaceCommand(['--workspace', join(tempDir, 'missing-workspace-data')])
    ).rejects.toThrow(`Workspace directory not found: ${join(tempDir, 'missing-workspace-data')}`);
  });

  it('does not delete the generated archive when using the default temp output', async () => {
    const workspaceDir = join(tempDir, 'workspace-data');
    await mkdir(workspaceDir, { recursive: true });

    const archivePath = await runExportWorkspaceCommand(['--workspace', workspaceDir]);

    expect(existsSync(archivePath)).toBe(true);
  });
});
