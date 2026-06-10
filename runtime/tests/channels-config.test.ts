import { describe, it, expect } from "vitest";
import { resolveChannelBinding, defaultAgentForPhase } from "../dist/channels/config.js";
import type { ChannelsConfig } from "../dist/channels/types.js";

const config: ChannelsConfig = {
  version: "1.0",
  enabled: true,
  default_provider: "slack",
  bindings: [
    { channel_id: "C123", phase: "discovery", agent_id: "requirements-conversation-agent" },
    { channel_id: "dev*", phase: "development", agent_id: "feature-intake-conversation-agent" },
  ],
};

describe("resolveChannelBinding", () => {
  it("matches exact channel id", () => {
    expect(resolveChannelBinding(config, "C123")?.phase).toBe("discovery");
  });

  it("matches prefix wildcard pattern", () => {
    expect(resolveChannelBinding(config, "dev-main")?.phase).toBe("development");
    expect(resolveChannelBinding(config, "dev")?.phase).toBe("development");
  });

  it("returns null for unbound channels", () => {
    expect(resolveChannelBinding(config, "C999")).toBeNull();
  });
});

describe("defaultAgentForPhase", () => {
  it("maps each lifecycle phase to its conversation agent", () => {
    expect(defaultAgentForPhase("intake")).toBe("project-intake-conversation-agent");
    expect(defaultAgentForPhase("discovery")).toBe("requirements-conversation-agent");
    expect(defaultAgentForPhase("architecture")).toBe("architecture-conversation-agent");
    expect(defaultAgentForPhase("development")).toBe("feature-intake-conversation-agent");
  });
});
