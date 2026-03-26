import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  configureWorkspaceTalentConfig,
  ensureWorkspaceTalentConfig,
  resolveBundledTalentsConfigPath,
  resolveWorkspaceSource,
} from '../src/workspace-config.js';

describe('workspace config helpers', () => {
  let tempDir: string;
  let originalTalentConfig: string | undefined;
  let originalTalentWorkspace: string | undefined;
  let originalInitCwd: string | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'talent-scout-workspace-config-'));
    originalTalentConfig = process.env['TALENT_CONFIG'];
    originalTalentWorkspace = process.env['TALENT_WORKSPACE'];
    originalInitCwd = process.env['INIT_CWD'];
  });

  afterEach(async () => {
    if (originalTalentConfig === undefined) {
      delete process.env['TALENT_CONFIG'];
    } else {
      process.env['TALENT_CONFIG'] = originalTalentConfig;
    }

    if (originalTalentWorkspace === undefined) {
      delete process.env['TALENT_WORKSPACE'];
    } else {
      process.env['TALENT_WORKSPACE'] = originalTalentWorkspace;
    }

    if (originalInitCwd === undefined) {
      delete process.env['INIT_CWD'];
    } else {
      process.env['INIT_CWD'] = originalInitCwd;
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  it('resolves the bundled talents template path', () => {
    const bundledPath = resolveBundledTalentsConfigPath();

    expect(bundledPath.endsWith('packages/skills/talents.yaml')).toBe(true);
    expect(existsSync(bundledPath)).toBe(true);
  });

  it('accepts either workspace-data itself or a project root containing workspace-data', async () => {
    const workspaceDir = join(tempDir, 'workspace-data');
    await mkdir(workspaceDir, { recursive: true });

    await expect(resolveWorkspaceSource(workspaceDir)).resolves.toBe(workspaceDir);
    await expect(resolveWorkspaceSource(tempDir)).resolves.toBe(workspaceDir);
  });

  it('resolves relative workspace paths from INIT_CWD for pnpm-filtered commands', async () => {
    const workspaceDir = join(tempDir, 'workspace-data');
    await mkdir(workspaceDir, { recursive: true });
    process.env['INIT_CWD'] = tempDir;

    await expect(resolveWorkspaceSource('./workspace-data')).resolves.toBe(workspaceDir);
  });

  it('rejects directories that do not contain workspace-data', async () => {
    const projectRoot = join(tempDir, 'project');
    await mkdir(projectRoot, { recursive: true });

    await expect(resolveWorkspaceSource(projectRoot)).rejects.toThrow(
      `Workspace directory not found: ${join(projectRoot, 'workspace-data')}`
    );
  });

  it('copies the bundled talents.yaml only when the workspace file is missing', async () => {
    const workspaceDir = join(tempDir, 'workspace-data');
    await mkdir(workspaceDir, { recursive: true });

    const seededPath = await ensureWorkspaceTalentConfig(workspaceDir);
    expect(existsSync(seededPath)).toBe(true);

    await writeFile(seededPath, 'api_budget:\n  max_total_calls: 321\n');
    await ensureWorkspaceTalentConfig(workspaceDir);

    expect(readFileSync(seededPath, 'utf-8')).toContain('max_total_calls: 321');
  });

  it('sets TALENT_WORKSPACE and TALENT_CONFIG when configuring a workspace', async () => {
    const workspaceDir = join(tempDir, 'workspace-data');
    await mkdir(workspaceDir, { recursive: true });

    const configPath = await configureWorkspaceTalentConfig(workspaceDir);

    expect(process.env['TALENT_WORKSPACE']).toBe(workspaceDir);
    expect(process.env['TALENT_CONFIG']).toBe(configPath);
    expect(existsSync(configPath)).toBe(true);
  });
});
