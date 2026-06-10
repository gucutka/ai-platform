import type { NotificationAdapter, NotificationAdapterFactory, NotificationProviderId } from "./types.js";
import { slackNotificationFactory } from "./adapters/slack.js";
import { stdioNotificationFactory } from "./adapters/stdio.js";
import { webhookNotificationFactory } from "./adapters/webhook.js";

const registry = new Map<NotificationProviderId, NotificationAdapterFactory>();

export function registerNotificationAdapter(
  id: NotificationProviderId,
  factory: NotificationAdapterFactory
): void {
  registry.set(id, factory);
}

export function ensureNotificationAdaptersRegistered(): void {
  if (registry.size) return;
  registerNotificationAdapter("slack", slackNotificationFactory);
  registerNotificationAdapter("webhook", webhookNotificationFactory);
  registerNotificationAdapter("stdio", stdioNotificationFactory);
}

export function getNotificationAdapter(provider: NotificationProviderId): NotificationAdapter {
  ensureNotificationAdaptersRegistered();
  const factory = registry.get(provider);
  if (!factory) throw new Error(`Unknown notification provider: ${provider}`);
  return factory.create();
}

export function listNotificationProviders(): string[] {
  ensureNotificationAdaptersRegistered();
  return [...registry.keys()];
}
