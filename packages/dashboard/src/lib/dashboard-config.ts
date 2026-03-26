import type { TalentConfig } from '@talent-scout/shared';
import { loadConfigFromPath } from '@talent-scout/shared';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import rawDashboardConfig from '../../dashboard.config.mjs';

interface DashboardConfigInput {
  projectRoot?: string | null;
  workspaceDir?: string;
  talentsConfigFile?: string;
}

export interface DashboardConfig {
  projectRoot: string;
  workspaceDir: string;
  outputDir: string;
  userDataDir: string;
  talentsConfigPath: string;
}

const ROOT_MARKERS = ['talents.yaml', 'pnpm-workspace.yaml'];
const DEFAULT_CONFIG: Required<Omit<DashboardConfigInput, 'projectRoot'>> & {
  projectRoot: string | null;
} = {
  projectRoot: null,
  workspaceDir: 'workspace-data',
  talentsConfigFile: 'talents.yaml',
};

const dashboardConfigInput = rawDashboardConfig as DashboardConfigInput;
let cachedTalentConfig: TalentConfig | null = null;

function resolveBase(base?: string): string {
  return resolve(base ?? process.env['INIT_CWD'] ?? process.cwd());
}

function hasAnyMarker(dirPath: string): boolean {
  return ROOT_MARKERS.some((marker) => existsSync(join(dirPath, marker)));
}

export function findProjectRoot(start: string): string {
  let current = resolveBase(start);

  for (;;) {
    if (hasAnyMarker(current)) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return resolveBase(start);
    }
    current = parent;
  }
}

function resolveFromRoot(projectRoot: string, target: string): string {
  return isAbsolute(target) ? resolve(target) : resolve(projectRoot, target);
}

export function loadDashboardConfig(base?: string): DashboardConfig {
  const start = resolveBase(base);
  const projectRoot = dashboardConfigInput.projectRoot
    ? resolveFromRoot(start, dashboardConfigInput.projectRoot)
    : findProjectRoot(start);
  const workspaceDir = resolveFromRoot(
    projectRoot,
    dashboardConfigInput.workspaceDir ?? DEFAULT_CONFIG.workspaceDir
  );
  const talentsConfigPath = resolveFromRoot(
    projectRoot,
    dashboardConfigInput.talentsConfigFile ?? DEFAULT_CONFIG.talentsConfigFile
  );

  return {
    projectRoot,
    workspaceDir,
    outputDir: join(workspaceDir, 'output', 'evaluated', 'latest'),
    userDataDir: join(workspaceDir, 'user-data'),
    talentsConfigPath,
  };
}

export async function loadDashboardTalentConfig(forceReload = false): Promise<TalentConfig> {
  if (cachedTalentConfig && !forceReload) {
    return cachedTalentConfig;
  }

  const { talentsConfigPath } = loadDashboardConfig();
  cachedTalentConfig = await loadConfigFromPath(talentsConfigPath);
  return cachedTalentConfig;
}

export function resetDashboardTalentConfigCache(): void {
  cachedTalentConfig = null;
}
