import { execa } from 'execa';

import type { CronJobConfig, ScheduledJob, Scheduler } from '../scheduler.js';

export interface MetaBotSchedulerConfig {
  bot_name: string;
  chat_id: string;
}

/**
 * Scheduler backed by the MetaBot schedule system (`mb schedule`).
 * Converts cron expressions to interval seconds for MetaBot's API.
 */
export class MetaBotScheduler implements Scheduler {
  constructor(private config: MetaBotSchedulerConfig) {}

  async sync(jobs: CronJobConfig[]): Promise<void> {
    for (const job of jobs) {
      const command = job.command.replace('{{project_dir}}', process.cwd());
      const seconds = cronToSeconds(job.schedule);

      await execa('mb', [
        'schedule', 'add',
        this.config.bot_name,
        this.config.chat_id,
        String(seconds),
        command,
      ]);
    }
  }

  async list(): Promise<ScheduledJob[]> {
    const { stdout } = await execa('mb', ['schedule', 'list', '--json']);
    const raw = JSON.parse(stdout) as {
      name?: string; command?: string; interval?: number; enabled?: boolean;
    }[];
    return raw.map((j) => ({
      name: j.name ?? 'unknown',
      schedule: j.interval ? `every ${String(j.interval)}s` : 'unknown',
      command: j.command ?? '',
      enabled: j.enabled ?? true,
    }));
  }

  async enable(name: string): Promise<void> {
    await execa('mb', ['schedule', 'enable', name]);
  }

  async disable(name: string): Promise<void> {
    await execa('mb', ['schedule', 'disable', name]);
  }
}

/** Convert a simple cron expression to approximate interval in seconds. */
function cronToSeconds(cron: string): number {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return 86400; // fallback: daily

  const [, hour, dayOfMonth, , dayOfWeek] = parts;

  // Weekly (day-of-week specified)
  if (dayOfWeek !== '*') return 604800;
  // Monthly (day-of-month specified)
  if (dayOfMonth !== '*') return 2592000;
  // Hourly (hour is *)
  if (hour === '*') return 3600;
  // Daily (default)
  return 86400;
}
