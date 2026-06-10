# Channel Integration

Provider-agnostic messaging layer for conversational pre-dev and feature intake.

**Slack is one adapter.** Teams, Discord, or internal tools use the same `ChannelAdapter` interface or the generic **webhook** format.

> Setting up Slack specifically? Follow the step-by-step
> **[Slack runbook (slack-setup.md)](slack-setup.md)** — per-agent, от и до.

## Architecture

```
Inbound (Slack Events API / webhook / stdio)
    → ChannelAdapter.parseInbound()
    → Orchestrator (phase + agent + McpAgentClient)
    → Agent uses Slack MCP for outbound reply (when configured)
    → emit_channel_turn for platform actions (write_knowledge, write_adr, …)
    → ChannelAdapter.sendReply() only if agent did not use Slack MCP
```

**Slack outbound** is handled by the agent via **Slack MCP** (`https://mcp.slack.com/mcp`) — see `cloud-agents/agents/*.agent.yaml`. The legacy `chat.postMessage` adapter path remains as fallback for agents without MCP.

## Live Slack server

```bash
export ANTHROPIC_API_KEY=...
export SLACK_BOT_TOKEN=...
export SLACK_SIGNING_SECRET=...
export CLAUDE_RUNTIME=cloud-agents

node dist/cli.js slack-events-server \
  --port 3000 \
  --project-dir ./client
```

Expose with ngrok and set Slack **Request URL** to `https://YOUR-NGROK/slack/events`.

Full walkthrough: [getting-started.md](getting-started.md).

## Providers

| Provider | ID | Use case |
|----------|-----|----------|
| Slack | `slack` | Slack Events API |
| Webhook | `webhook` | Normalized JSON — any system |
| Stdio | `stdio` | Local CLI / tests |

List registered:

```bash
node dist/cli.js channel-providers
```

## Configuration

`.ai-platform/channels.yaml`:

```yaml
version: "1.0"
enabled: true
default_provider: slack
bindings:
  - channel_id: "C01234567"
    phase: discovery
    agent_id: requirements-conversation-agent
  - channel_id: "dev*"
    phase: development
    agent_id: feature-intake-conversation-agent
```

Bind from CLI:

```bash
node dist/cli.js channel-bind \
  --channel discovery-main \
  --phase discovery \
  --project-dir ./client
```

## Local chat (no Slack)

```bash
export ANTHROPIC_API_KEY=...
export CLAUDE_RUNTIME=cloud-agents

node dist/cli.js channel-chat \
  --message "We are building a B2B todo SaaS for teams" \
  --channel discovery-main \
  --project-dir ./client
```

## Generic webhook payload

Any integration can POST normalized JSON:

```json
{
  "provider": "teams",
  "workspace_id": "org-1",
  "channel_id": "general",
  "thread_id": "thread-1",
  "message_id": "msg-1",
  "text": "Add OAuth login",
  "user_id": "user-1"
}
```

Verify with header `X-Channel-Signature: sha256=...` and secret `CHANNEL_WEBHOOK_SECRET`.

```bash
node dist/cli.js channel-receive \
  --provider webhook \
  --payload-file event.json \
  --project-dir ./client
```

## Slack

1. Create Slack app with `message.channels` event
2. Set secrets: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`
3. Point Events URL to a proxy that runs `channel-receive --provider slack`

Or use GitHub workflow **Channel Events** with `repository_dispatch` type `channel-event`.

## Architecture phase (Epic C)

Bind `architecture` phase → `architecture-conversation-agent`. The orchestrator:

- Blocks until **business knowledge is approved**
- Injects only approved business context
- Supports `write_adr` for auto-numbered ADRs

See [architecture-conversation.md](architecture-conversation.md).

## Agent actions

Agents emit `ChannelAgentTurn` with optional actions:

| Action | Effect |
|--------|--------|
| `write_knowledge` | `docs/knowledge/{layer}/{path}` |
| `write_adr` | `docs/knowledge/technical/adr/ADR-NNN-slug.md` |
| `approve_layer` | Update `approvals.yaml` |
| `scaffold_project` | Run app template + onboard |
| `create_github_issue` | Issue + `agent-route:pending` |
| `ask_clarification` | Reply only |

## Adding a new provider

1. Implement `ChannelAdapter` in `runtime/src/channels/adapters/{name}/adapter.ts`
2. Register in `channels/registry.ts`:

```typescript
registerChannelAdapter("teams", teamsAdapterFactory);
```

No changes to orchestrator, actions, or session store.

## Licensing

Conversation agents are in `cloud-agents/catalog.yaml` under package `channel-pack`.

```yaml
purchased_agents: [channel-pack]
```

## Sessions

Stored in `.ai-platform/channel-sessions/` with conversation history in `{sessionId}.history.jsonl`.

```bash
node dist/cli.js channel-status --project-dir ./client
```
