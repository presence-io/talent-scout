import { resolve } from 'node:path';

/**
 * Resolve the workspace-data root directory.
 * Uses TALENT_WORKSPACE env var if set, otherwise defaults to `$PWD/workspace-data`.
 */
export function resolveWorkspaceDir(base?: string): string {
  if (process.env['TALENT_WORKSPACE']) return resolve(process.env['TALENT_WORKSPACE']);
  return resolve(base ?? process.cwd(), 'workspace-data');
}

/** Resolve the output directory root: `workspace-data/output`. */
export function resolveOutputDir(base?: string): string {
  return resolve(resolveWorkspaceDir(base), 'output');
}

/** Resolve the user-data directory: `workspace-data/user-data`. */
export function resolveUserDataDir(base?: string): string {
  return resolve(resolveWorkspaceDir(base), 'user-data');
}

/** Resolve the cache directory: `workspace-data/cache`. */
export function resolveCacheDir(base?: string): string {
  return resolve(resolveWorkspaceDir(base), 'cache');
}

/** Resolve the skill-patches directory: `workspace-data/skill-patches`. */
export function resolvePatchDir(base?: string): string {
  return resolve(resolveWorkspaceDir(base), 'skill-patches');
}
