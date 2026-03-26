export interface NotifyOptions {
  title?: string;
  /** For card-based notifications (MetaBot) */
  fields?: { label: string; value: string | number }[];
}

/** Abstract notifier for pipeline completion events. */
export interface Notifier {
  /** Send a notification message. */
  send(message: string, options?: NotifyOptions): Promise<void>;
}
