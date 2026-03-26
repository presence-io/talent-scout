import {
  resetConfigCache,
  resolveWorkspaceConfigPath,
  resolveWorkspaceDir,
} from '@talent-scout/shared';
import { copyFile, lstat, mkdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const bundledTalentsConfigPath = fileURLToPath(new URL('../talents.yaml', import.meta.url));

function resolveCliPath(targetPath: string): string {
  return resolve(process.env['INIT_CWD'] ?? process.cwd(), targetPath);
}

export function resolveBundledTalentsConfigPath(): string {
  return bundledTalentsConfigPath;
}

export async function resolveWorkspaceSource(inputPath?: string): Promise<string> {
  const initialPath = inputPath ? resolveCliPath(inputPath) : resolveWorkspaceDir();
  const stats = await lstat(initialPath).catch(() => null);

  if (!stats?.isDirectory()) {
    throw new Error(`Workspace directory not found: ${initialPath}`);
  }

  if (basename(initialPath) === 'workspace-data') {
    return initialPath;
  }

  const nestedWorkspacePath = resolve(initialPath, 'workspace-data');
  const nestedStats = await lstat(nestedWorkspacePath).catch(() => null);
  if (nestedStats?.isDirectory()) {
    return nestedWorkspacePath;
  }

  throw new Error(`Workspace directory not found: ${nestedWorkspacePath}`);
}

export async function ensureWorkspaceTalentConfig(
  workspaceDir = resolveWorkspaceDir()
): Promise<string> {
  const resolvedWorkspaceDir = resolve(workspaceDir);
  const workspaceConfigPath = resolveWorkspaceConfigPath(resolvedWorkspaceDir);

  await mkdir(resolvedWorkspaceDir, { recursive: true });

  const existing = await lstat(workspaceConfigPath).catch(() => null);
  if (!existing) {
    await copyFile(bundledTalentsConfigPath, workspaceConfigPath);
  }

  return workspaceConfigPath;
}

export async function configureWorkspaceTalentConfig(
  workspaceDir = resolveWorkspaceDir()
): Promise<string> {
  const resolvedWorkspaceDir = resolve(workspaceDir);
  process.env['TALENT_WORKSPACE'] = resolvedWorkspaceDir;

  const workspaceConfigPath = await ensureWorkspaceTalentConfig(resolvedWorkspaceDir);
  process.env['TALENT_CONFIG'] = workspaceConfigPath;
  resetConfigCache();

  return workspaceConfigPath;
}
