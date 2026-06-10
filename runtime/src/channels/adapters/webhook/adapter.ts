import crypto from "node:crypto";
import type {
  ChannelAdapter,
  ChannelAdapterFactory,
  InboundChannelEvent,
  OutboundChannelMessage,
} from "../../types.js";

/**
 * Generic JSON webhook adapter — map any chat system via a normalized payload:
 *
 * {
 *   "provider": "teams",
 *   "workspace_id": "org-1",
 *   "channel_id": "general",
 *   "thread_id": "thread-1",
 *   "message_id": "msg-1",
 *   "text": "Hello",
 *   "user_id": "user-1"
 * }
 *
 * Or an array of such objects.
 */
export class WebhookChannelAdapter implements ChannelAdapter {
  readonly providerId: string;

  constructor(defaultProvider = "webhook") {
    this.providerId = defaultProvider;
  }

  verifyInbound(opts: {
    rawBody: string;
    headers: Record<string, string | undefined>;
    secret?: string;
  }): boolean {
    if (!opts.secret) return true;
    const sig = opts.headers["x-channel-signature"] ?? opts.headers["x-hub-signature-256"];
    if (!sig?.startsWith("sha256=")) return false;
    const expected = crypto
      .createHmac("sha256", opts.secret)
      .update(opts.rawBody, "utf8")
      .digest("hex");
    const received = sig.slice("sha256=".length);
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
    } catch {
      return false;
    }
  }

  parseInbound(raw: unknown): InboundChannelEvent[] {
    const normalize = (item: Record<string, unknown>): InboundChannelEvent | null => {
      const text = String(item.text ?? "").trim();
      const channelId = String(item.channel_id ?? "");
      if (!text || !channelId) return null;
      const provider = String(item.provider ?? this.providerId);
      return {
        contract: "InboundChannelEvent",
        version: "1.0",
        address: {
          provider,
          workspace_id: item.workspace_id ? String(item.workspace_id) : undefined,
          channel_id: channelId,
          thread_id: item.thread_id ? String(item.thread_id) : undefined,
        },
        message_id: String(item.message_id ?? crypto.randomUUID()),
        text,
        user_id: item.user_id ? String(item.user_id) : undefined,
        user_display_name: item.user_display_name ? String(item.user_display_name) : undefined,
        timestamp: item.timestamp ? String(item.timestamp) : undefined,
        raw: item,
      };
    };

    if (Array.isArray(raw)) {
      return raw
        .map((r) => normalize(r as Record<string, unknown>))
        .filter((e): e is InboundChannelEvent => e !== null);
    }
    if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      if (Array.isArray(obj.messages)) {
        return obj.messages
          .map((m) => normalize(m as Record<string, unknown>))
          .filter((e): e is InboundChannelEvent => e !== null);
      }
      const one = normalize(obj);
      return one ? [one] : [];
    }
    return [];
  }

  formatOutbound(message: OutboundChannelMessage): { body: Record<string, unknown> } {
    return {
      body: {
        provider: message.address.provider,
        channel_id: message.address.channel_id,
        thread_id: message.address.thread_id,
        text: message.text,
        blocks: message.blocks,
      },
    };
  }
}

export const webhookAdapterFactory: ChannelAdapterFactory = {
  create: (opts) => new WebhookChannelAdapter(String(opts?.providerId ?? "webhook")),
};
