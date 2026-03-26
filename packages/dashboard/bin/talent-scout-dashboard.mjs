#!/usr/bin/env node

import AdmZip from 'adm-zip';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const tempDirectories = new Set();

function toDirectoryUrl(pathname) {
  const href = pathToFileURL(pathname).href;
  return href.endsWith('/') ? href : `${href}/`;
}

function trackTempDirectory(pathname) {
  tempDirectories.add(pathname);
}

function cleanupTempDirectories() {
  for (const tempDirectory of tempDirectories) {
    rmSync(tempDirectory, { recursive: true, force: true });
  }

  tempDirectories.clear();
}

function isWorkspaceDirectory(pathname) {
  return existsSync(resolve(pathname, 'output')) || existsSync(resolve(pathname, 'user-data'));
}

function resolveWorkspaceInput(inputPath) {
  const absolutePath = resolve(inputPath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Workspace path not found: ${absolutePath}`);
  }

  const stats = statSync(absolutePath);
  if (stats.isDirectory()) {
    if (isWorkspaceDirectory(absolutePath)) {
      return {
        workspaceDir: absolutePath,
        readOnly: false,
      };
    }

    const nestedWorkspacePath = resolve(absolutePath, 'workspace-data');
    if (existsSync(nestedWorkspacePath) && statSync(nestedWorkspacePath).isDirectory()) {
      return {
        workspaceDir: nestedWorkspacePath,
        readOnly: false,
      };
    }

    throw new Error(
      '`--workspace` must point to a workspace-data directory, a project root containing workspace-data/, or a zip exported from @talent-scout/skills.'
    );
  }

  if (!absolutePath.toLowerCase().endsWith('.zip')) {
    throw new Error('`--workspace` file inputs must be .zip archives.');
  }

  const tempRoot = mkdtempSync(join(tmpdir(), 'talent-scout-dashboard-'));
  trackTempDirectory(tempRoot);

  const archive = new AdmZip(absolutePath);
  archive.extractAllTo(tempRoot, true);

  const directWorkspacePath = resolve(tempRoot, 'workspace-data');
  if (existsSync(directWorkspacePath) && statSync(directWorkspacePath).isDirectory()) {
    return {
      workspaceDir: directWorkspacePath,
      readOnly: true,
    };
  }

  if (isWorkspaceDirectory(tempRoot)) {
    return {
      workspaceDir: tempRoot,
      readOnly: true,
    };
  }

  const extractedDirectories = readdirSync(tempRoot, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory()
  );
  if (extractedDirectories.length === 1) {
    const onlyDirectory = resolve(tempRoot, extractedDirectories[0].name);
    if (isWorkspaceDirectory(onlyDirectory)) {
      return {
        workspaceDir: onlyDirectory,
        readOnly: true,
      };
    }
  }

  throw new Error(
    '`--workspace` zip archives must contain a workspace-data/ directory or output/user-data at the archive root.'
  );
}

const argv = await yargs(hideBin(process.argv))
  .scriptName('talent-scout-dashboard')
  .usage('$0 [options]')
  .option('host', {
    type: 'string',
    default: process.env.HOST ?? 'localhost',
    describe: 'Host interface to bind the dashboard server to.',
  })
  .option('port', {
    type: 'number',
    default: process.env.PORT ? Number(process.env.PORT) : 4321,
    describe: 'Port to bind the dashboard server to.',
  })
  .option('project-root', {
    type: 'string',
    describe: 'Project root used to resolve relative dashboard data paths.',
  })
  .option('workspace', {
    alias: 'workspace-dir',
    type: 'string',
    describe: 'Workspace-data directory or exported workspace-data.zip to open.',
  })
  .option('talents-config', {
    type: 'string',
    describe: 'Path to talents.yaml, relative to project root unless absolute.',
  })
  .example(
    '$0 --host 0.0.0.0 --port 4510 --workspace ./workspace-data.zip',
    'Start the dashboard against a local workspace export.'
  )
  .check((options) => {
    if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
      throw new Error('--port must be an integer between 1 and 65535.');
    }

    return true;
  })
  .strict()
  .help()
  .parseAsync();

process.on('exit', cleanupTempDirectories);

process.env.ASTRO_NODE_AUTOSTART = 'disabled';
process.env.HOST = argv.host;
process.env.PORT = String(argv.port);
process.env.TALENT_SCOUT_DASHBOARD_READ_ONLY = '0';

if (argv.workspace) {
  const { workspaceDir, readOnly } = resolveWorkspaceInput(argv.workspace);
  process.env.TALENT_SCOUT_DASHBOARD_WORKSPACE_DIR = workspaceDir;
  process.env.TALENT_SCOUT_DASHBOARD_READ_ONLY = readOnly ? '1' : '0';

  if (!argv.projectRoot) {
    process.env.TALENT_SCOUT_DASHBOARD_PROJECT_ROOT = resolve(workspaceDir, '..');
  }
}

if (argv.projectRoot) {
  process.env.TALENT_SCOUT_DASHBOARD_PROJECT_ROOT = argv.projectRoot;
}

if (argv.talentsConfig) {
  process.env.TALENT_SCOUT_DASHBOARD_TALENTS_CONFIG = argv.talentsConfig;
}

const binDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(binDir, '..');
const clientDir = resolve(packageRoot, 'dist', 'client');
const serverDir = resolve(packageRoot, 'dist', 'server');
const serverEntryPath = resolve(serverDir, 'entry.mjs');

if (!existsSync(clientDir) || !existsSync(serverEntryPath)) {
  console.error(
    'Missing Astro dashboard build output. Run `pnpm --filter @talent-scout/dashboard build` before publishing or invoking the CLI.'
  );
  process.exit(1);
}

const dashboardServer = await import(pathToFileURL(serverEntryPath).href);

if (!dashboardServer?.options || typeof dashboardServer.startServer !== 'function') {
  console.error('Dashboard server entry is missing the Astro standalone exports.');
  process.exit(1);
}

dashboardServer.options.client = toDirectoryUrl(clientDir);
dashboardServer.options.server = toDirectoryUrl(serverDir);
dashboardServer.options.host = argv.host;
dashboardServer.options.port = argv.port;

const serverHandle = dashboardServer.startServer();
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  try {
    await serverHandle.server.stop();
    cleanupTempDirectories();
  } catch (error) {
    console.error(`Failed to stop dashboard server after ${signal}:`, error);
    process.exitCode = 1;
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

await serverHandle.done;
