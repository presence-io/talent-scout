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

export interface DashboardCapabilities {
  readOnly: boolean;
  canMutate: boolean;
  showOpenClawFeatures: boolean;
}

const ROOT_MARKERS = ['talents.yaml', 'pnpm-workspace.yaml'];
const DEFAULT_CONFIG: Required<Omit<DashboardConfigInput, 'projectRoot'>> & {
  projectRoot: string | null;
} = {
  projectRoot: null,
  workspaceDir: 'workspace-data',
  talentsConfigFile: 'workspace-data/talents.yaml',
};

const DASHBOARD_CONFIG_ENV = {
  projectRoot: 'TALENT_SCOUT_DASHBOARD_PROJECT_ROOT',
  workspaceDir: 'TALENT_SCOUT_DASHBOARD_WORKSPACE_DIR',
  talentsConfigFile: 'TALENT_SCOUT_DASHBOARD_TALENTS_CONFIG',
} as const;

const DASHBOARD_CAPABILITY_ENV = {
  readOnly: 'TALENT_SCOUT_DASHBOARD_READ_ONLY',
} as const;

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

function readEnvOverride(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function getDashboardConfigInput(): DashboardConfigInput {
  return {
    projectRoot:
      readEnvOverride(DASHBOARD_CONFIG_ENV.projectRoot) ??
      dashboardConfigInput.projectRoot ??
      DEFAULT_CONFIG.projectRoot,
    workspaceDir:
      readEnvOverride(DASHBOARD_CONFIG_ENV.workspaceDir) ??
      dashboardConfigInput.workspaceDir ??
      DEFAULT_CONFIG.workspaceDir,
    talentsConfigFile:
      readEnvOverride(DASHBOARD_CONFIG_ENV.talentsConfigFile) ??
      dashboardConfigInput.talentsConfigFile ??
      DEFAULT_CONFIG.talentsConfigFile,
  };
}

export function loadDashboardConfig(base?: string): DashboardConfig {
  const start = resolveBase(base);
  const runtimeConfigInput = getDashboardConfigInput();
  const projectRoot = runtimeConfigInput.projectRoot
    ? resolveFromRoot(start, runtimeConfigInput.projectRoot)
    : findProjectRoot(start);
  const workspaceDir = resolveFromRoot(
    projectRoot,
    runtimeConfigInput.workspaceDir ?? DEFAULT_CONFIG.workspaceDir
  );
  const talentsConfigPath = resolveFromRoot(
    projectRoot,
    runtimeConfigInput.talentsConfigFile ?? DEFAULT_CONFIG.talentsConfigFile
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

export function loadDashboardCapabilities(): DashboardCapabilities {
  const readOnly = process.env[DASHBOARD_CAPABILITY_ENV.readOnly] === '1';

  return {
    readOnly,
    canMutate: !readOnly,
    showOpenClawFeatures: !readOnly,
  };
}

export function assertDashboardWritable(): void {
  if (loadDashboardCapabilities().readOnly) {
    throw new Error(
      'Dashboard is running in read-only mode from a workspace archive. Local edits are disabled.'
    );
  }
}
