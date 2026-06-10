# ADR-0004: Dual Claude runtime (Cloud Agents + Messages/MCP)

**Status:** Accepted (retroactive)  
**Date:** 2026-06-09  
**Change / PR:** MCP agent refactor

## Context

Agents need an LLM runtime. Anthropic offers both **Claude Cloud Agents**
(hosted, registered agents) and the **Messages API with MCP** (cloud-provided
tools) usable via Claude Code. Different deployments favor different options.

## Decision

Support **both** runtimes behind a single seam:

- `runtime/src/claude-runtime.ts` selects the runtime via `CLAUDE_RUNTIME`
  (`cloud-agents` | `claude-code`).
- `runtime/src/mcp-agent-client.ts` invokes the Beta Messages API with MCP
  servers (`mcp_toolset`) and platform/contract toolsets.
- Agent identity is defined once in `.agent.yaml`
  ([ADR-0001](ADR-0001-agent-definition-layers.md)) and consumed by either runtime.
- `manifest.platform.yaml` lists supported runtimes.

## Consequences

### Positive

- Deployment flexibility; no lock-in to a single Anthropic product.
- MCP gives agents real tools (Slack, GitHub) without bespoke glue.

### Negative / trade-offs

- Two code paths to test; SDK surface (Beta) can change.
- Tool/permission semantics differ slightly between runtimes.

## Alternatives considered

1. **Cloud Agents only** — rejected: less control for local/CI runs.
2. **Messages API only** — rejected: loses hosted Cloud Agent benefits.

## References

- `runtime/src/claude-runtime.ts`, `runtime/src/mcp-agent-client.ts`
- [Claude Cloud Agents integration](../guides/claude-cloud-agents-integration.md)
- [Claude Code integration](../guides/claude-code-integration.md)
