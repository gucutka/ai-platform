import crypto from "node:crypto";
import type {
  ChannelAdapter,
  ChannelAdapterFactory,
  InboundChannelEvent,
  OutboundChannelBlock,
  OutboundChannelMessage,
} from "../../types.js";

/** Subtypes that must never trigger an agent turn. */
const IGNORED_MESSAGE_SUBTYPES = new Set([
  "bot_message",
  "message_changed",
  "message_deleted",
  "message_replied",
  "channel_join",
  "channel_leave",
  "channel_topic",
  "channel_purpose",
  "channel_name",
  "channel_archive",
  "channel_unarchive",
  "group_join",
  "group_leave",
  "pinned_item",
  "unpinned_item",
]);

/** Slack may retry the same event_id — ignore duplicates within this window. */
const SEEN_EVENT_TTL_MS = 5 * 60 * 1000;
const seenSlackEventIds = new Map<string, number>();

function verifySlackSignature(
  rawBody: string,
  signature: string | undefined,
  timestamp: string | undefined,
  secret: string
): boolean {
  if (!signature?.startsWith("v0=") || !timestamp) return false;
  const base = `v0:${timestamp}:${rawBody}`;
  const expected = "v0=" + crypto.createHmac("sha256", secret).update(base).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** True when this Slack message event must not invoke an agent (bot echo, edits, etc.). */
export function isIgnorableSlackMessage(event: Record<string, unknown>): boolean {
  const subtype = event.subtype ? String(event.subtype) : "";
  if (subtype && IGNORED_MESSAGE_SUBTYPES.has(subtype)) return true;

  // chat.postMessage bot replies often have bot_id but NOT subtype bot_message.
  if (event.bot_id) return true;
  if (event.bot_profile) return true;

  const botUserId = process.env.SLACK_BOT_USER_ID?.trim();
  if (botUserId && event.user === botUserId) return true;

  return false;
}

/** Drop duplicate Slack Events API deliveries (retries). */
export function isDuplicateSlackDelivery(raw: unknown): boolean {
  const eventId = (raw as { event_id?: string }).event_id;
  if (!eventId) return false;

  const now = Date.now();
  for (const [id, seenAt] of seenSlackEventIds) {
    if (now - seenAt > SEEN_EVENT_TTL_MS) seenSlackEventIds.delete(id);
  }
  if (seenSlackEventIds.has(eventId)) return true;
  seenSlackEventIds.set(eventId, now);
  return false;
}

/** Reset dedup cache (tests only). */
export function resetSlackEventDedupForTests(): void {
  seenSlackEventIds.clear();
}

/** Split long replies for Slack section blocks (3000 char limit). */
function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf("\n\n", maxLen);
    if (cut < maxLen * 0.5) cut = rest.lastIndexOf("\n", maxLen);
    if (cut < maxLen * 0.5) cut = maxLen;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export class SlackChannelAdapter implements ChannelAdapter {
  readonly providerId = "slack";

  verifyInbound(opts: {
    rawBody: string;
    headers: Record<string, string | undefined>;
    secret?: string;
  }): boolean {
    if (!opts.secret) return true;
    return verifySlackSignature(
      opts.rawBody,
      opts.headers["x-slack-signature"],
      opts.headers["x-slack-request-timestamp"],
      opts.secret
    );
  }

  parseInbound(raw: unknown): InboundChannelEvent[] {
    const body = raw as Record<string, unknown>;
    if (body.type === "url_verification") {
      return [];
    }

    const event = body.event as Record<string, unknown> | undefined;
    if (!event || event.type !== "message") return [];
    if (isIgnorableSlackMessage(event)) return [];

    const channelId = String(event.channel ?? "");
    const text = String(event.text ?? "").trim();
    if (!text) return [];

    const teamId = String((body.team_id as string) ?? (event.team as string) ?? "");

    return [
      {
        contract: "InboundChannelEvent",
        version: "1.0",
        address: {
          provider: "slack",
          workspace_id: teamId || undefined,
          channel_id: channelId,
          thread_id: event.thread_ts ? String(event.thread_ts) : event.ts ? String(event.ts) : undefined,
        },
        message_id: String(event.ts ?? crypto.randomUUID()),
        text,
        user_id: event.user ? String(event.user) : undefined,
        timestamp: event.ts ? String(event.ts) : undefined,
        raw: body,
      },
    ];
  }

  formatOutbound(message: OutboundChannelMessage): { body: Record<string, unknown> } {
    const SLACK_BLOCK_TEXT_LIMIT = 2900;

    const explicitBlocks = message.blocks?.length
      ? message.blocks.map((b: OutboundChannelBlock) => ({
          type: "section",
          text: { type: b.markdown ? "mrkdwn" : "plain_text", text: b.text ?? "" },
        }))
      : undefined;

    const blocks =
      explicitBlocks ??
      (message.text
        ? chunkText(message.text, SLACK_BLOCK_TEXT_LIMIT).map((chunk) => ({
            type: "section",
            text: { type: "mrkdwn", text: chunk },
          }))
        : undefined);

    return {
      body: {
        channel: message.address.channel_id,
        text: message.text,
        ...(message.address.thread_id && message.thread_reply !== false
          ? { thread_ts: message.address.thread_id }
          : {}),
        ...(blocks?.length ? { blocks } : {}),
      },
    };
  }

  async sendReply(
    message: OutboundChannelMessage,
    opts: { token?: string; apiBaseUrl?: string }
  ): Promise<void> {
    const token = opts.token ?? process.env.SLACK_BOT_TOKEN;
    if (!token) throw new Error("SLACK_BOT_TOKEN required to send Slack replies");

    const { body } = this.formatOutbound(message);
    const res = await fetch(`${opts.apiBaseUrl ?? "https://slack.com"}/api/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Slack chat.postMessage failed: ${res.status} ${errText}`);
    }
  }
}

export const slackAdapterFactory: ChannelAdapterFactory = {
  create: () => new SlackChannelAdapter(),
};

/** Slack URL verification challenge response */
export function slackUrlVerificationResponse(raw: unknown): string | null {
  const body = raw as { type?: string; challenge?: string };
  if (body.type === "url_verification" && body.challenge) {
    return body.challenge;
  }
  return null;
}
