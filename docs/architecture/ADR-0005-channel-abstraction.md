# ADR-0005: Channel abstraction for conversational SDLC

**Status:** Accepted (retroactive)  
**Date:** 2026-06-09  
**Change / PR:** Slack-via-MCP integration

## Context

Pre-development work (intake, requirements, architecture, feature requests)
happens in conversation, not issues. We need to support Slack now and other
channels later without coupling agent logic to a provider.

## Decision

Introduce a **channel layer** that normalizes inbound/outbound messages:

- Providers: `slack`, `webhook`, `stdio` — selected by adapter
  (`runtime/src/channels/`).
- Inbound Slack via the Events API server
  (`runtime/src/slack-events-server.ts`) → `processChannelInbound`.
- Outbound Slack via **MCP** (`mcp_toolset`) from conversation agents.
- Conversation agents (`tier: channel`) are driven entirely by their
  `.agent.yaml` `system` prompt; no pipeline runtime/TS modules
  ([ADR-0001](ADR-0001-agent-definition-layers.md)).
- A conversation turn can produce side effects (write_knowledge, approve_layer,
  create_github_issue) that bridge into the pipeline.

## Consequences

### Positive

- One orchestration path for all channels; Slack today, more later.
- MCP removes bespoke Slack SDK glue for outbound messages.

### Negative / trade-offs

- Inbound still needs a reachable HTTP endpoint (ngrok/host) for Slack events.
- Signature verification + token handling must be configured per workspace.

## Alternatives considered

1. **Direct Slack SDK throughout** — rejected: provider lock-in, more glue.
2. **Issues-only (no chat)** — rejected: poor pre-dev UX.

## References

- `runtime/src/channels/`, `runtime/src/slack-events-server.ts`
- [Channel integration guide](../guides/channel-integration.md)
- [Secrets & setup](../guides/secrets-and-setup.md)
