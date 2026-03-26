import { createScheduler, loadConfig, syncCronJobs } from '@talent-scout/shared';
import {
  cronDisable as sharedCronDisable,
  cronEnable as sharedCronEnable,
  cronRun as sharedCronRun,
  cronRuns as sharedCronRuns,
} from '@talent-scout/shared';

export type { CronRunInfo } from '@talent-scout/shared';

/** Display configured cron jobs from talents.yaml. */
export async function cronStatus(): Promise<void> {
  const config = await loadConfig();
  const jobs = config.openclaw.cron;

  if (jobs.length === 0) {
    console.log('No cron jobs configured.');
    return;
  }

  const schedulerType = config.scheduler?.type ?? 'openclaw';
  console.log(`Configured cron jobs (scheduler: ${schedulerType}):`);
  console.log('');
  for (const job of jobs) {
    console.log(`  ${job.name}`);
    console.log(`    Schedule: ${job.schedule}`);
    console.log(`    Command:  ${job.command}`);
    if (job.description) {
      console.log(`    Desc:     ${job.description}`);
    }
    console.log('');
  }
}

/** Sync cron jobs using the configured scheduler backend. */
export async function cronSync(): Promise<void> {
  const config = await loadConfig();
  const schedulerType = config.scheduler?.type ?? 'openclaw';

  if (schedulerType === 'openclaw') {
    // Legacy path for backward compatibility
    console.log('Syncing cron jobs to OpenClaw...');
    await syncCronJobs();
  } else {
    const scheduler = createScheduler(config);
    console.log(`Syncing cron jobs via ${schedulerType} scheduler...`);
    await scheduler.sync(config.openclaw.cron);
  }

  console.log('Cron jobs synced.');
}

/** List recent cron run history from OpenClaw. */
export async function cronRuns(): ReturnType<typeof sharedCronRuns> {
  return sharedCronRuns();
}

/** Get details of a specific cron run. */
export async function cronRun(name: string): ReturnType<typeof sharedCronRun> {
  return sharedCronRun(name);
}

/** Disable a cron job. */
export async function cronDisable(name: string): Promise<void> {
  const config = await loadConfig();
  const schedulerType = config.scheduler?.type ?? 'openclaw';

  if (schedulerType === 'openclaw') {
    await sharedCronDisable(name);
  } else {
    const scheduler = createScheduler(config);
    await scheduler.disable(name);
  }
  console.log(`Cron job "${name}" disabled.`);
}

/** Enable a cron job. */
export async function cronEnable(name: string): Promise<void> {
  const config = await loadConfig();
  const schedulerType = config.scheduler?.type ?? 'openclaw';

  if (schedulerType === 'openclaw') {
    await sharedCronEnable(name);
  } else {
    const scheduler = createScheduler(config);
    await scheduler.enable(name);
  }
  console.log(`Cron job "${name}" enabled.`);
}
