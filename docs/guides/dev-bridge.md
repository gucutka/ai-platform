# Dev Bridge (Epic D)

Connect **feature intake** (chat) → **GitHub Issues** → **existing SDLC pipeline**, with optional notifications back to Slack/webhook.

## Flow

```
dev channel / feature-chat
    → feature-intake-conversation-agent
    → create_github_issue (structured body + agent-route:pending)
    → issue-routing / ai-platform-pipeline workflow
    → run-pipeline → PR → review → merge → release
    → SDLC notifications → same dev thread (optional)
```

## Feature intake

### Prerequisites

Discovery + architecture complete (`development-status`):

```bash
node dist/cli.js development-status --project-dir ./client
```

### Local chat

```bash
export ANTHROPIC_API_KEY=...
export CLAUDE_RUNTIME=cloud-agents
export GITHUB_TOKEN=...

node dist/cli.js feature-chat \
  --message "Add Vercel Analytics with page views and custom events" \
  --channel dev-main \
  --project-dir ./client
```

### Issue format

Agent emits `create_github_issue` with:

| Field | Purpose |
|-------|---------|
| `user_story` | As a … I want … so that … |
| `acceptance_criteria` | Testable bullets |
| `area` | frontend / backend / fullstack / infra |
| `priority` | p0–p3 |

Issues include `agent-route:pending` → pipeline starts via client workflow.

### Channel → issue link

When an issue is created from chat, the platform stores a link in `.ai-platform/channel-sessions/issue-links.json` and embeds:

```html
<!-- ai-platform-channel:slack:C123:thread_ts -->
```

Notifications route back to that thread when possible.

## Channel binding

```yaml
# .ai-platform/channels.yaml
bindings:
  - channel_id: "dev*"
    phase: development
    agent_id: feature-intake-conversation-agent
```

```bash
node dist/cli.js channel-bind --channel dev-main --phase development --project-dir ./client
```

## SDLC notifications

Provider-agnostic layer (same swap pattern as channels).

### Config

`.ai-platform/notifications.yaml`:

```yaml
version: "1.0"
enabled: true
provider: slack
channel_id: C01234567   # fallback if no issue link

events:
  pr_created: true
  review_pass: true
  merged: true
  released: true
```

Secrets: `SLACK_BOT_TOKEN` (Slack) or `CHANNEL_NOTIFY_WEBHOOK_URL` (generic webhook).

### Events

| Event | When |
|-------|------|
| `pr_created` | After pipeline opens PR |
| `review_pass` | Review agent PASS |
| `review_fail` | Review agent FAIL |
| `merged` | Post-merge SDLC starts |
| `released` | Release published |

### Test

```bash
# stdio provider (default when enabled without Slack token in dev)
node dist/cli.js notify-sdlc-event \
  --event pr_created \
  --issue 42 \
  --pr 7 \
  --project-dir ./client
```

```bash
node dist/cli.js notification-providers
```

## Licensing

Requires `channel-pack` or `feature-intake-conversation-agent` in `purchased_agents`.

## Related

- [channel-integration.md](channel-integration.md)
- [architecture-conversation.md](architecture-conversation.md)
- [project-lifecycle.md](project-lifecycle.md)
