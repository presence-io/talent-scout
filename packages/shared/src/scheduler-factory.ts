import type { TalentConfig } from './config.js';
import type { Scheduler } from './scheduler.js';
import { MetaBotScheduler } from './schedulers/metabot-scheduler.js';
import { OpenClawScheduler } from './schedulers/openclaw-scheduler.js';
import { SystemScheduler } from './schedulers/system-scheduler.js';

/** Create a Scheduler instance based on the `scheduler.type` config. */
export function createScheduler(config: TalentConfig): Scheduler {
  const schedulerType = config.scheduler?.type ?? 'openclaw';

  switch (schedulerType) {
    case 'openclaw':
      return new OpenClawScheduler();
    case 'metabot':
      if (!config.ai?.metabot) {
        throw new Error('ai.metabot config required when scheduler is "metabot"');
      }
      return new MetaBotScheduler({
        bot_name: config.ai.metabot.bot_name,
        chat_id: config.ai.metabot.chat_id,
      });
    case 'system':
      return new SystemScheduler();
    default:
      throw new Error(`Unknown scheduler type: "${schedulerType}". Use openclaw, metabot, or system.`);
  }
}
