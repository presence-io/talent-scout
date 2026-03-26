import { loadConfig } from '@talent-scout/shared';
import { syncCronJobs } from '@talent-scout/shared';

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
