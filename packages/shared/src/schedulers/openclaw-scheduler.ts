import { execa } from 'execa';

import type { CronJobConfig, ScheduledJob, Scheduler } from '../scheduler.js';

/** Scheduler backed by the OpenClaw cron system. */
export class OpenClawScheduler implements Scheduler {
  async sync(jobs: CronJobConfig[]): Promise<void> {
    const { stdout } = await execa('openclaw', ['cron', 'list', '--json']);
    const existing = JSON.parse(stdout) as { name: string; schedule: string; command: string }[];
    const existingByName = new Map(existing.map((j) => [j.name, j]));

    for (const job of jobs) {
      const command = job.command.replace('{{project_dir}}', process.cwd());
      const current = existingByName.get(job.name);

      if (!current) {
        await execa('openclaw', [
          'cron', 'add', '--name', job.name,
          '--schedule', job.schedule, '--command', command,
        ]);
      } else if (current.schedule !== job.schedule || current.command !== command) {
        await execa('openclaw', ['cron', 'remove', '--name', job.name]);
        await execa('openclaw', [
          'cron', 'add', '--name', job.name,
          '--schedule', job.schedule, '--command', command,
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

  async list(): Promise<ScheduledJob[]> {
    const { stdout } = await execa('openclaw', ['cron', 'list', '--json']);
    const jobs = JSON.parse(stdout) as { name: string; schedule: string; command: string }[];
    return jobs.map((j) => ({ ...j, enabled: true }));
  }

  async enable(name: string): Promise<void> {
    await execa('openclaw', ['cron', 'enable', '--name', name]);
  }

  async disable(name: string): Promise<void> {
    await execa('openclaw', ['cron', 'disable', '--name', name]);
  }
}
