import { slackAdapterFactory } from "./adapters/slack/adapter.js";
import { webhookAdapterFactory } from "./adapters/webhook/adapter.js";
import { stdioAdapterFactory } from "./adapters/stdio/adapter.js";
import type { ChannelAdapter, ChannelAdapterFactory, ChannelProviderId } from "./types.js";

const factories = new Map<ChannelProviderId, ChannelAdapterFactory>();

let registered = false;

export function registerChannelAdapter(
  providerId: ChannelProviderId,
  factory: ChannelAdapterFactory
): void {
  factories.set(providerId, factory);
}

export function getChannelAdapter(
  providerId: ChannelProviderId,
  opts?: Record<string, unknown>
): ChannelAdapter {
  ensureChannelAdaptersRegistered();
  const factory = factories.get(providerId);
  if (!factory) {
    throw new Error(
      `Unknown channel provider: ${providerId}. Registered: ${[...factories.keys()].join(", ")}`
    );
  }
  return factory.create(opts);
}

export function listChannelProviders(): ChannelProviderId[] {
  ensureChannelAdaptersRegistered();
  return [...factories.keys()];
}

export function ensureChannelAdaptersRegistered(): void {
  if (registered) return;
  registerChannelAdapter("slack", slackAdapterFactory);
  registerChannelAdapter("webhook", webhookAdapterFactory);
  registerChannelAdapter("stdio", stdioAdapterFactory);
  registered = true;
}
