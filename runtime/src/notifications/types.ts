/**
 * Provider-agnostic SDLC notifications (Slack, webhook, stdio).
 * Swap provider in notifications.yaml — same pattern as ChannelAdapter.
 */

export type NotificationProviderId = string;

export type SdlcNotificationEventType =
  | "pr_created"
  | "review_pass"
  | "review_fail"
  | "merged"
  | "released";

export interface SdlcNotificationEvent {
  contract: "SdlcNotificationEvent";
  version: "1.0";
  type: SdlcNotificationEventType;
  project_id?: string;
  issue_number: number;
  pr_number?: number;
  title?: string;
  url?: string;
  release_tag?: string;
  extra?: Record<string, string>;
}

export interface NotificationTarget {
  provider: NotificationProviderId;
  channel_id: string;
  thread_id?: string;
}

export interface NotificationsConfig {
  version: string;
  enabled: boolean;
  provider?: NotificationProviderId;
  channel_id?: string;
  thread_id?: string;
  events?: Partial<Record<SdlcNotificationEventType, boolean>>;
  webhook_url?: string;
}

export interface NotificationAdapter {
  readonly providerId: NotificationProviderId;
  send(opts: {
    target: NotificationTarget;
    text: string;
    event: SdlcNotificationEvent;
    webhookUrl?: string;
  }): Promise<void>;
}

export interface NotificationAdapterFactory {
  create(opts?: Record<string, unknown>): NotificationAdapter;
}
