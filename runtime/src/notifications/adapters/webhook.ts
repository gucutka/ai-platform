import crypto from "node:crypto";
import type { NotificationAdapter, NotificationAdapterFactory } from "../types.js";

export class WebhookNotificationAdapter implements NotificationAdapter {
  readonly providerId = "webhook";

  async send(opts: Parameters<NotificationAdapter["send"]>[0]): Promise<void> {
    const url = opts.webhookUrl ?? process.env.CHANNEL_NOTIFY_WEBHOOK_URL;
    if (!url) throw new Error("CHANNEL_NOTIFY_WEBHOOK_URL or notifications.webhook_url required");

    const body = JSON.stringify({
      provider: "webhook",
      channel_id: opts.target.channel_id,
      thread_id: opts.target.thread_id,
      text: opts.text,
      event: opts.event,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const secret = process.env.CHANNEL_NOTIFY_WEBHOOK_SECRET ?? process.env.CHANNEL_WEBHOOK_SECRET;
    if (secret) {
      const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
      headers["X-Channel-Signature"] = `sha256=${sig}`;
    }

    const res = await fetch(url, { method: "POST", headers, body });
    if (!res.ok) {
      throw new Error(`Notification webhook failed: ${res.status} ${await res.text()}`);
    }
  }
}

export const webhookNotificationFactory: NotificationAdapterFactory = {
  create: () => new WebhookNotificationAdapter(),
};
