import { SlackChannelAdapter } from "../../channels/adapters/slack/adapter.js";
import type { NotificationAdapter } from "../types.js";

export class SlackNotificationAdapter implements NotificationAdapter {
  readonly providerId = "slack";
  private slack = new SlackChannelAdapter();

  async send(opts: {
    target: { channel_id: string; thread_id?: string };
    text: string;
  }): Promise<void> {
    await this.slack.sendReply!(
      {
        contract: "OutboundChannelMessage",
        version: "1.0",
        address: {
          provider: "slack",
          channel_id: opts.target.channel_id,
          thread_id: opts.target.thread_id,
        },
        text: opts.text,
        thread_reply: !!opts.target.thread_id,
      },
      { token: process.env.SLACK_BOT_TOKEN }
    );
  }
}

export const slackNotificationFactory = {
  create: () => new SlackNotificationAdapter(),
};
