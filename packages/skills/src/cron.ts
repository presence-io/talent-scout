import { loadConfig, syncCronJobs } from '@talent-scout/shared';
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

  console.log('Configured cron jobs:');
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

/** Sync cron jobs to OpenClaw. */
export async function cronSync(): Promise<void> {
  console.log('Syncing cron jobs to OpenClaw...');
  await syncCronJobs();
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

/** Disable a cron job in OpenClaw. */
export async function cronDisable(name: string): Promise<void> {
  await sharedCronDisable(name);
  console.log(`Cron job "${name}" disabled.`);
}

/** Enable a cron job in OpenClaw. */
export async function cronEnable(name: string): Promise<void> {
  await sharedCronEnable(name);
  console.log(`Cron job "${name}" enabled.`);
}
