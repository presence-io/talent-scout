import type { Notifier, NotifyOptions } from '../notifier.js';
import { sendMessage } from '../openclaw.js';
import type { TalentConfig } from '../config.js';

/** Notifier backed by OpenClaw message delivery (Telegram, Slack, etc.). */
export class OpenClawNotifier implements Notifier {
  constructor(private config: TalentConfig) {}

  async send(message: string, options?: NotifyOptions): Promise<void> {
    const delivery = this.config.openclaw.delivery;
    if (!delivery) {
      console.log('[OpenClawNotifier] No delivery config, skipping notification');
      return;
    }

    const fullMessage = options?.title ? `**${options.title}**\n\n${message}` : message;

    await sendMessage({
      channel: delivery.channel,
      target: delivery.target,
      message: fullMessage,
      account: delivery.account,
      threadId: delivery.thread_id,
    });
  }
}
