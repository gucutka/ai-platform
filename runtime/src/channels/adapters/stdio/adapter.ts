import type {
  ChannelAdapter,
  ChannelAdapterFactory,
  InboundChannelEvent,
  OutboundChannelMessage,
} from "../../types.js";

/** Local CLI / tests — no external API. */
export class StdioChannelAdapter implements ChannelAdapter {
  readonly providerId = "stdio";

  parseInbound(raw: unknown): InboundChannelEvent[] {
    const obj =
      typeof raw === "string"
        ? ({ text: raw, channel_id: "local", provider: "stdio" } as Record<string, unknown>)
        : (raw as Record<string, unknown>);

    const text = String(obj.text ?? "").trim();
    if (!text) return [];

    return [
      {
        contract: "InboundChannelEvent",
        version: "1.0",
        address: {
          provider: "stdio",
          channel_id: String(obj.channel_id ?? "local"),
          thread_id: obj.thread_id ? String(obj.thread_id) : undefined,
        },
        message_id: String(obj.message_id ?? `stdio-${Date.now()}`),
        text,
        user_id: obj.user_id ? String(obj.user_id) : "local-user",
        raw: obj,
      },
    ];
  }

  formatOutbound(message: OutboundChannelMessage): { body: Record<string, unknown> } {
    return { body: { text: message.text } };
  }

  async sendReply(message: OutboundChannelMessage): Promise<void> {
    console.log(message.text);
  }
}

export const stdioAdapterFactory: ChannelAdapterFactory = {
  create: () => new StdioChannelAdapter(),
};
