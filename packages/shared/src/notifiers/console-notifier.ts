import type { Notifier, NotifyOptions } from '../notifier.js';

/** Notifier that outputs to console. Used for Claude Code / local runs. */
export class ConsoleNotifier implements Notifier {
  async send(message: string, options?: NotifyOptions): Promise<void> {
    if (options?.title) {
      console.log(`\n=== ${options.title} ===`);
    }
    console.log(message);
  }
}
