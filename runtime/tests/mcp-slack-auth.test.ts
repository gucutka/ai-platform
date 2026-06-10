import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveMcpServers, slackMcpOAuthToken } from "../dist/agent-definition.js";

describe("resolveMcpServers (Slack hosted MCP)", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    delete process.env.SLACK_MCP_OAUTH_TOKEN;
    delete process.env.SLACK_USER_OAUTH_TOKEN;
    delete process.env.SLACK_BOT_TOKEN;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("skips mcp.slack.com when only SLACK_BOT_TOKEN is set", () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-fake-bot-token";
    const servers = resolveMcpServers([
      {
        name: "slack",
        type: "url",
        url: "https://mcp.slack.com/mcp",
        authorization_token_env: "SLACK_BOT_TOKEN",
      },
    ]);
    expect(servers).toEqual([]);
  });

  it("includes slack MCP when SLACK_MCP_OAUTH_TOKEN (xoxp-) is set", () => {
    process.env.SLACK_MCP_OAUTH_TOKEN = "xoxp-user-oauth-token";
    const servers = resolveMcpServers([
      {
        name: "slack",
        type: "url",
        url: "https://mcp.slack.com/mcp",
        authorization_token_env: "SLACK_BOT_TOKEN",
      },
    ]);
    expect(servers).toHaveLength(1);
    expect(servers[0].authorization_token).toBe("xoxp-user-oauth-token");
  });

  it("slackMcpOAuthToken ignores xoxb bot tokens", () => {
    process.env.SLACK_USER_OAUTH_TOKEN = "xoxb-not-user";
    expect(slackMcpOAuthToken()).toBeUndefined();
  });
});
