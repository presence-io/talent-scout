#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

function toDirectoryUrl(pathname) {
  const href = pathToFileURL(pathname).href;
  return href.endsWith('/') ? href : `${href}/`;
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
  .option('workspace-dir', {
    type: 'string',
    describe: 'Workspace data directory, relative to project root unless absolute.',
  })
  .option('talents-config', {
    type: 'string',
    describe: 'Path to talents.yaml, relative to project root unless absolute.',
  })
  .example(
    '$0 --host 0.0.0.0 --port 4510 --project-root . --workspace-dir workspace-data',
    'Start the dashboard against the current repository workspace.'
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

process.env.ASTRO_NODE_AUTOSTART = 'disabled';
process.env.HOST = argv.host;
process.env.PORT = String(argv.port);

if (argv.projectRoot) {
  process.env.TALENT_SCOUT_DASHBOARD_PROJECT_ROOT = argv.projectRoot;
}

if (argv.workspaceDir) {
  process.env.TALENT_SCOUT_DASHBOARD_WORKSPACE_DIR = argv.workspaceDir;
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
