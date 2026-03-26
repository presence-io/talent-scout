import { execa } from 'execa';

import { loadConfig } from './config.js';

export interface AgentRequest {
  task: string;
  [key: string]: unknown;
}

export interface AgentResult {
  [key: string]: unknown;
}

/**
 * Call an OpenClaw agent by its key defined in talents.yaml `openclaw.agents`.
 * Automatically resolves agent name, workspace, and timeout from config.
 */
export async function callAgent(agentKey: string, request: AgentRequest): Promise<AgentResult> {
  const config = await loadConfig();
  const agentConfig = config.openclaw.agents[agentKey];
  if (!agentConfig) {
    throw new Error(`Unknown agent key: "${agentKey}". Check openclaw.agents in talents.yaml.`);
  }

  const args = ['agent', '--message', JSON.stringify(request), '--json'];
  if (agentConfig.name) {
    args.push('--agent-name', agentConfig.name);
  }
  if (agentConfig.workspace) {
    args.push('--workspace', agentConfig.workspace);
  }

  const { stdout } = await execa('openclaw', args, {
    timeout: agentConfig.timeout * 1000,
  });

  return JSON.parse(stdout) as AgentResult;
}

export interface CronJob {
  name: string;
  schedule: string;
  command: string;
}

/**
 * Sync cron jobs defined in talents.yaml to OpenClaw.
 * - New jobs are added.
 * - Changed jobs are updated (remove + add).
 * - Jobs with `talent-` prefix that are no longer in config are removed.
 */
export async function syncCronJobs(): Promise<void> {
  const config = await loadConfig();
  const cronConfig = config.openclaw.cron;

  const { stdout } = await execa('openclaw', ['cron', 'list', '--json']);
  const existing = JSON.parse(stdout) as CronJob[];
  const existingByName = new Map(existing.map((j) => [j.name, j]));

  for (const job of cronConfig) {
    const command = job.command.replace('{{project_dir}}', process.cwd());
    const current = existingByName.get(job.name);

    if (!current) {
      await execa('openclaw', [
        'cron',
        'add',
        '--name',
        job.name,
        '--schedule',
        job.schedule,
        '--command',
        command,
      ]);
    } else if (current.schedule !== job.schedule || current.command !== command) {
      await execa('openclaw', ['cron', 'remove', '--name', job.name]);
      await execa('openclaw', [
        'cron',
        'add',
        '--name',
        job.name,
        '--schedule',
        job.schedule,
        '--command',
        command,
      ]);
    }
    existingByName.delete(job.name);
  }

  // Remove orphaned talent-* jobs
  for (const [name] of existingByName) {
    if (name.startsWith('talent-')) {
      await execa('openclaw', ['cron', 'remove', '--name', name]);
    }
  }
}

export interface CronRunInfo {
  name: string;
  status: string;
  started_at?: string;
  finished_at?: string;
}

/** List recent cron run history from OpenClaw. */
export async function cronRuns(): Promise<CronRunInfo[]> {
  const { stdout } = await execa('openclaw', ['cron', 'runs', '--json']);
  return JSON.parse(stdout) as CronRunInfo[];
}

/** Get details of a specific cron run by name. */
export async function cronRun(name: string): Promise<CronRunInfo | null> {
  const { stdout } = await execa('openclaw', ['cron', 'run', '--name', name, '--json']);
  return JSON.parse(stdout) as CronRunInfo | null;
}

/** Disable a cron job in OpenClaw. */
export async function cronDisable(name: string): Promise<void> {
  await execa('openclaw', ['cron', 'disable', '--name', name]);
}

/** Enable a cron job in OpenClaw. */
export async function cronEnable(name: string): Promise<void> {
  await execa('openclaw', ['cron', 'enable', '--name', name]);
}
