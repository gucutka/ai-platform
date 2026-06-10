# Architecture Conversation (Epic C)

Conversational architecture phase: reads **approved business** knowledge, writes **technical** docs and **ADRs**.

## Prerequisites

1. Business discovery complete (`knowledge:business-approved`)
2. Channel bound to architecture phase (or use `architecture-chat`)

Check readiness:

```bash
node dist/cli.js architecture-status --project-dir ./client
```

If blocked, complete discovery first:

```bash
node dist/cli.js channel-chat \
  --phase discovery \
  --message "Finalize business vision" \
  --project-dir ./client
```

## Local architecture chat

```bash
export ANTHROPIC_API_KEY=...
export CLAUDE_RUNTIME=cloud-agents

node dist/cli.js architecture-chat \
  --message "We need Postgres, OAuth, and Vercel deployment" \
  --channel arch-main \
  --project-dir ./client
```

Or via generic channel CLI:

```bash
node dist/cli.js channel-chat \
  --phase architecture \
  --message "..." \
  --channel arch-main \
  --project-dir ./client
```

## Agent actions

| Action | Use |
|--------|-----|
| `write_knowledge` | Technical overviews (`stack.md`, `modules.md`) |
| `write_adr` | Numbered ADR under `docs/knowledge/technical/adr/` |
| `approve_layer` | Mark technical layer approved when user confirms |

### write_adr example (in ChannelAgentTurn)

```json
{
  "type": "write_adr",
  "title": "Use PostgreSQL as primary datastore",
  "context": "Multi-tenant B2B SaaS with relational data...",
  "decision": "PostgreSQL on managed RDS with row-level tenant isolation",
  "consequences": "Requires migration tooling; ops owns backups",
  "status": "Proposed"
}
```

## ADR layout

```
docs/knowledge/technical/adr/
├── ADR-001-postgresql-primary-datastore.md
├── ADR-002-oauth-authentication.md
└── ...
```

List ADRs:

```bash
node dist/cli.js list-adrs --project-dir ./client
```

Manual draft (without LLM):

```bash
node dist/cli.js draft-adr \
  --title "OAuth authentication" \
  --context "Users sign in via Google and email" \
  --decision "Clerk for auth; JWT for API" \
  --project-dir ./client
```

## Channel binding

```yaml
# .ai-platform/channels.yaml
bindings:
  - channel_id: "arch*"
    phase: architecture
    agent_id: architecture-conversation-agent
```

```bash
node dist/cli.js channel-bind \
  --channel arch-main \
  --phase architecture \
  --project-dir ./client
```

## Lifecycle

Architecture phase completes when `knowledge:technical-approved` is met (via `approve_layer` or knowledge workflow). Then development pipeline and feature intake unlock.

See [project-lifecycle.md](project-lifecycle.md) and [channel-integration.md](channel-integration.md).

## Licensing

Requires `channel-pack` or `architecture-conversation-agent` in `purchased_agents`.
