import { execa } from 'execa';

import type { CronJobConfig, ScheduledJob, Scheduler } from '../scheduler.js';

/**
 * Scheduler backed by system crontab.
 * Used as a fallback for Claude Code / standalone environments without OpenClaw or MetaBot.
 */
export class SystemScheduler implements Scheduler {
  async sync(jobs: CronJobConfig[]): Promise<void> {
    // Read existing crontab
    let existing = '';
    try {
      const { stdout } = await execa('crontab', ['-l']);
      existing = stdout;
    } catch {
      // No crontab exists yet
    }

    // Remove old talent-scout entries
    const lines = existing.split('\n').filter(
      (line) => !line.includes('# talent-scout:')
    );

    // Add new entries
    for (const job of jobs) {
      const command = job.command.replace('{{project_dir}}', process.cwd());
      lines.push(`${job.schedule} ${command} # talent-scout:${job.name}`);
    }

    // Write back
    const newCrontab = lines.filter(Boolean).join('\n') + '\n';
    await execa('crontab', ['-'], { input: newCrontab });
  }

  async list(): Promise<ScheduledJob[]> {
    let crontab = '';
    try {
      const { stdout } = await execa('crontab', ['-l']);
      crontab = stdout;
    } catch {
      return [];
    }

    return crontab
      .split('\n')
      .filter((line) => line.includes('# talent-scout:'))
      .map((line) => {
        const match = line.match(/# talent-scout:(.+)$/);
        const name = match?.[1] ?? 'unknown';
        const parts = line.split(/\s+/);
        const schedule = parts.slice(0, 5).join(' ');
        const command = parts.slice(5).join(' ').replace(/\s*#.*$/, '');
        return { name, schedule, command, enabled: true };
      });
  }

  async enable(name: string): Promise<void> {
    console.log(`System crontab does not support enable/disable. Job "${name}" is always active.`);
  }

  async disable(name: string): Promise<void> {
    // Remove the job from crontab
    let existing = '';
    try {
      const { stdout } = await execa('crontab', ['-l']);
      existing = stdout;
    } catch {
      return;
    }

    const lines = existing.split('\n').filter(
      (line) => !line.includes(`# talent-scout:${name}`)
    );
    const newCrontab = lines.filter(Boolean).join('\n') + '\n';
    await execa('crontab', ['-'], { input: newCrontab });
  }
}
