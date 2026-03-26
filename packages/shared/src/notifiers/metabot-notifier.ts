import { execa } from 'execa';

import type { Notifier, NotifyOptions } from '../notifier.js';

export interface MetaBotNotifierConfig {
  bot_name: string;
  chat_id: string;
}

/** Notifier that sends results via MetaBot agent bus (Feishu/Telegram card). */
export class MetaBotNotifier implements Notifier {
  constructor(private config: MetaBotNotifierConfig) {}

  async send(message: string, options?: NotifyOptions): Promise<void> {
    const prompt = options?.title
      ? `Send this notification to the chat:\n\nTitle: ${options.title}\n\n${message}`
      : `Send this notification to the chat:\n\n${message}`;

    await execa('mb', [
      'task',
      this.config.bot_name,
      this.config.chat_id,
      prompt,
    ]);
  }
}
