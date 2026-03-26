import { basename, resolve } from 'node:path';

/**
 * Determine the effective project root.
 * When invoked via `pnpm --filter`, INIT_CWD is the original working directory
 * (typically the monorepo root). Falls back to process.cwd().
 */
function effectiveRoot(base?: string): string {
  return base ?? process.env['INIT_CWD'] ?? process.cwd();
}

/**
 * Resolve the workspace-data root directory.
 * Uses TALENT_WORKSPACE env var if set, otherwise defaults to `<root>/workspace-data`.
 */
export function resolveWorkspaceDir(base?: string): string {
  if (process.env['TALENT_WORKSPACE']) return resolve(process.env['TALENT_WORKSPACE']);
  if (base && basename(resolve(base)) === 'workspace-data') return resolve(base);
  return resolve(effectiveRoot(base), 'workspace-data');
}

/** Resolve the workspace-scoped talents.yaml path: `workspace-data/talents.yaml`. */
export function resolveWorkspaceConfigPath(base?: string): string {
  return resolve(resolveWorkspaceDir(base), 'talents.yaml');
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
