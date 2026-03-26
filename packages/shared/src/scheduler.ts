export interface CronJobConfig {
  name: string;
  schedule: string;
  command: string;
  description?: string;
}

export interface ScheduledJob {
  name: string;
  schedule: string;
  command: string;
  enabled: boolean;
}

/** Abstract scheduler for managing periodic pipeline runs. */
export interface Scheduler {
  /** Sync job definitions to the scheduler backend. */
  sync(jobs: CronJobConfig[]): Promise<void>;
  /** List currently registered jobs. */
  list(): Promise<ScheduledJob[]>;
  /** Enable a job by name. */
  enable(name: string): Promise<void>;
  /** Disable a job by name. */
  disable(name: string): Promise<void>;
}
