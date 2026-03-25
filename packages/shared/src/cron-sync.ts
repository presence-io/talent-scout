import { syncCronJobs } from './openclaw.js';

syncCronJobs()
  .then(() => {
    console.log('Cron jobs synced successfully.');
  })
  .catch((err: unknown) => {
    console.error('Failed to sync cron jobs:', err);
    process.exitCode = 1;
  });
