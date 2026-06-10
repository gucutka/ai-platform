# Claude Cloud Agents Integration Guide

See [cloud-agent-catalog.md](./cloud-agent-catalog.md) for SKUs, provisioning, and licensing.

## Primary Runtime

Set `CLAUDE_RUNTIME=cloud-agents` to route dispatcher calls through the catalog-backed `CloudAgentClient` (sessions + SKU licensing).

Default fallback: Messages API (`messages`).

## Dispatch Pipeline

```
GitHub webhook → issue-routing.yml → workflow-agent
  → context-build.yml → context-builder-agent → ContextPack@1.0
  → SDLC agent API call → contract-validate.yml
  → contract-validator-agent (semantic, if needed)
  → handoff-summarizer-agent
```

## Secrets

| Secret | Purpose |
|--------|---------|
| `ANTHROPIC_API_KEY` | Cloud Agents API |
| `AI_PLATFORM_WEBHOOK_SECRET` | Webhook verification |

## Pool Sizing

| Tier | Max concurrent |
|------|----------------|
| standard | 20 |
| enterprise | 50 |
| regulated | 10 |

## Idempotency

Dispatch key: `{project_id}:{issue_id}:{stage}:{attempt}`
