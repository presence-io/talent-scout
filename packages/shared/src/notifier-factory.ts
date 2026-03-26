import type { TalentConfig } from './config.js';
import type { Notifier } from './notifier.js';
import { ConsoleNotifier } from './notifiers/console-notifier.js';
import { MetaBotNotifier } from './notifiers/metabot-notifier.js';
import { OpenClawNotifier } from './notifiers/openclaw-notifier.js';

/** Create a Notifier instance based on the `notifier.type` config. */
export function createNotifier(config: TalentConfig): Notifier {
  const notifierType = config.notifier?.type ?? 'console';

  switch (notifierType) {
    case 'openclaw':
      return new OpenClawNotifier(config);
    case 'metabot':
      if (!config.ai?.metabot) {
        throw new Error('ai.metabot config required when notifier is "metabot"');
      }
      return new MetaBotNotifier({
        bot_name: config.ai.metabot.bot_name,
        chat_id: config.ai.metabot.chat_id,
      });
    case 'console':
      return new ConsoleNotifier();
    default:
      throw new Error(`Unknown notifier type: "${notifierType}". Use openclaw, metabot, or console.`);
  }
}
