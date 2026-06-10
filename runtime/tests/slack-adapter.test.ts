import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  SlackChannelAdapter,
  isIgnorableSlackMessage,
  isDuplicateSlackDelivery,
  resetSlackEventDedupForTests,
} from "../dist/channels/adapters/slack/adapter.js";

describe("isIgnorableSlackMessage", () => {
  const envBackup = process.env.SLACK_BOT_USER_ID;

  afterEach(() => {
    if (envBackup === undefined) delete process.env.SLACK_BOT_USER_ID;
    else process.env.SLACK_BOT_USER_ID = envBackup;
  });

  it("ignores subtype bot_message", () => {
    expect(isIgnorableSlackMessage({ type: "message", subtype: "bot_message", text: "hi" })).toBe(
      true
    );
  });

  it("ignores messages with bot_id (chat.postMessage echo)", () => {
    expect(
      isIgnorableSlackMessage({
        type: "message",
        text: "Agent reply",
        bot_id: "B0B9J93CDHA",
        user: "U0B9CJAFXN2",
      })
    ).toBe(true);
  });

  it("ignores messages from SLACK_BOT_USER_ID", () => {
    process.env.SLACK_BOT_USER_ID = "U0B9CJAFXN2";
    expect(isIgnorableSlackMessage({ type: "message", user: "U0B9CJAFXN2", text: "echo" })).toBe(
      true
    );
    expect(isIgnorableSlackMessage({ type: "message", user: "U_HUMAN", text: "hello" })).toBe(
      false
    );
  });

  it("ignores message_changed edits", () => {
    expect(isIgnorableSlackMessage({ type: "message", subtype: "message_changed" })).toBe(true);
  });
});

describe("SlackChannelAdapter.formatOutbound", () => {
  const adapter = new SlackChannelAdapter();

  it("wraps reply text in mrkdwn section blocks", () => {
    const { body } = adapter.formatOutbound({
      contract: "OutboundChannelMessage",
      version: "1.0",
      address: { provider: "slack", channel_id: "C1", thread_id: "1.0" },
      text: "*Bold* and • bullet",
    });
    expect(body.blocks).toEqual([
      { type: "section", text: { type: "mrkdwn", text: "*Bold* and • bullet" } },
    ]);
    expect(body.thread_ts).toBe("1.0");
  });
});

describe("SlackChannelAdapter.parseInbound", () => {
  const adapter = new SlackChannelAdapter();

  it("parses human message, skips bot echo", () => {
    const human = adapter.parseInbound({
      team_id: "T1",
      event: { type: "message", channel: "C1", user: "U_HUMAN", text: "hello", ts: "1.0" },
    });
    expect(human).toHaveLength(1);
    expect(human[0].text).toBe("hello");

    const botEcho = adapter.parseInbound({
      team_id: "T1",
      event: {
        type: "message",
        channel: "C1",
        user: "U_BOT",
        bot_id: "B1",
        text: "my own reply",
        ts: "2.0",
        thread_ts: "1.0",
      },
    });
    expect(botEcho).toHaveLength(0);
  });
});

describe("isDuplicateSlackDelivery", () => {
  beforeEach(() => resetSlackEventDedupForTests());

  it("deduplicates same event_id", () => {
    const payload = { event_id: "Ev123", event: { type: "message" } };
    expect(isDuplicateSlackDelivery(payload)).toBe(false);
    expect(isDuplicateSlackDelivery(payload)).toBe(true);
  });
});
