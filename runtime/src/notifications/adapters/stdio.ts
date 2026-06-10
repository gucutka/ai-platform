import type { NotificationAdapter, NotificationAdapterFactory } from "../types.js";

export class StdioNotificationAdapter implements NotificationAdapter {
  readonly providerId = "stdio";

  async send(opts: Parameters<NotificationAdapter["send"]>[0]): Promise<void> {
    console.log(`[sdlc-notify:${opts.event.type}] → ${opts.target.channel_id}\n${opts.text}`);
  }
}

export const stdioNotificationFactory: NotificationAdapterFactory = {
  create: () => new StdioNotificationAdapter(),
};
