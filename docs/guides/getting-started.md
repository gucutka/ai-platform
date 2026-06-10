# Getting Started — Agentic SDLC (from zero)

Complete beginner guide: install → first Slack thread with BA agent → first pipeline issue.

**Requirements:** Node.js 20+, GitHub account, Anthropic API key, Slack workspace (admin or app install rights).

---

## 1. Clone and build platform

```bash
git clone <your-ai-platform-repo> ai-platform
cd ai-platform/runtime
npm install
npm run build
```

Verify:

```bash
node dist/cli.js list-agent-definitions | head -20
node dist/cli.js channel-providers
```

---

## 2. Prepare client project

Use the reference client or your own repo:

```bash
# Option A — demo client (sibling folder)
cd ../demo-todo-app

# Option B — onboard new project
node ../ai-platform/runtime/dist/cli.js onboard-project \
  --target /path/to/my-app \
  --project-id my-app \
  --tier standard
```

Ensure `.ai-platform/manifest.yaml` exists.

Optional licensing (empty = all agents):

```yaml
purchased_agents: [channel-pack]
```

---

## 3. Environment variables

**Полная карта секретов и файлов:** [secrets-and-setup.md](secrets-and-setup.md)

Create a shell profile or copy the example:

```bash
cp ai-platform/runtime/.env.example ai-platform/runtime/.env
# edit .env — never commit it
set -a && source ai-platform/runtime/.env && set +a
```

Minimum:

```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
export CLAUDE_RUNTIME=cloud-agents

# Slack (for MCP + Events API)
export SLACK_BOT_TOKEN=xoxb-...
export SLACK_SIGNING_SECRET=...

# GitHub (feature intake + pipeline)
export GITHUB_TOKEN=ghp_...
export GITHUB_REPOSITORY=your-org/demo-todo-app
```

---

## 4. Agent definitions (Claude format)

Agents live in **`cloud-agents/agents/*.agent.yaml`** — one file per agent:

```yaml
name: Requirements conversation agent
description: ...
model: claude-opus-4-5
system: |-
  You are a business analyst...
mcp_servers:
  - name: slack
    type: url
    url: https://mcp.slack.com/mcp
    authorization_token_env: SLACK_BOT_TOKEN
tools:
  - type: mcp_toolset
    mcp_server_name: slack
  - type: platform_toolset
    actions: [write_knowledge, approve_layer]
metadata:
  agent_id: requirements-conversation-agent
  sku: channel-ba
```

View an agent:

```bash
node dist/cli.js show-agent --agent requirements-conversation-agent
```

**How it works:**
- **Slack MCP** — agent posts replies in Slack (no custom bot code for outbound)
- **platform_toolset** — `write_knowledge`, `create_github_issue`, etc. (platform actions)
- **contract_toolset** — pipeline agents emit JSON contracts (triage, requirements)

---

## 5. Slack App setup (one channel / thread)

> **Полный Slack-runbook от и до (по каждому агенту, 4 канала, гейты):** [slack-setup.md](slack-setup.md)
> · карта секретов: [secrets-and-setup.md §4–5](secrets-and-setup.md#4-настройка-slack-бота)

### 5.1 Create app

1. Go to https://api.slack.com/apps → **Create New App** → From scratch  
2. Name: `AI Platform Bot`  
3. Pick your workspace

### 5.2 Bot scopes

**OAuth & Permissions** → Scopes → Bot Token Scopes:

- `chat:write`
- `channels:history`
- `channels:read`

Click **Install to Workspace** → copy **Bot User OAuth Token** → `SLACK_BOT_TOKEN`

### 5.3 Signing secret

**Basic Information** → **Signing Secret** → `SLACK_SIGNING_SECRET`

### 5.4 Create channel

1. Create `#ai-discovery`  
2. `/invite @AI Platform Bot`  
3. Get **Channel ID**: channel details → bottom → `C0123456789`

### 5.5 Bind agent to channel

```bash
cd ai-platform/runtime

node dist/cli.js channel-bind \
  --channel C0123456789 \
  --phase discovery \
  --project-dir /path/to/demo-todo-app
```

This writes `.ai-platform/channels.yaml`:

```yaml
enabled: true
bindings:
  - channel_id: "C0123456789"
    phase: discovery
    agent_id: requirements-conversation-agent
```

### 5.6 Events API + ngrok

1. Install ngrok: https://ngrok.com  
2. Start platform Slack server:

```bash
export ANTHROPIC_API_KEY=...
export SLACK_BOT_TOKEN=...
export SLACK_SIGNING_SECRET=...
export CLAUDE_RUNTIME=cloud-agents

node dist/cli.js slack-events-server \
  --port 3000 \
  --project-dir /path/to/demo-todo-app
```

3. In another terminal:

```bash
ngrok http 3000
```

4. In Slack app → **Event Subscriptions** → Enable  
   - Request URL: `https://YOUR-NGROK-ID.ngrok.io/slack/events`  
   - Wait for ✅ Verified  
5. Subscribe to bot event: **`message.channels`**

### 5.7 Talk to the agent

Post in `#ai-discovery`:

> Мы делаем B2B todo для команд, multi-tenant, Express API

The agent should:
1. Reply **in Slack** (via Slack MCP)
2. Ask clarifying questions
3. Eventually write files under `docs/knowledge/business/`

Check:

```bash
node dist/cli.js channel-status --project-dir /path/to/demo-todo-app
ls docs/knowledge/business/
```

---

## 6. Test without Slack (stdio)

Same agent, no ngrok:

```bash
node dist/cli.js channel-chat \
  --phase discovery \
  --message "B2B todo SaaS for teams" \
  --channel local-test \
  --project-dir /path/to/demo-todo-app
```

---

## 7. Architecture & feature phases

```bash
# After business approved in .ai-platform/knowledge/approvals.yaml
node dist/cli.js architecture-chat \
  --message "Postgres + OAuth" \
  --project-dir /path/to/demo-todo-app

# After lifecycle allows development
node dist/cli.js feature-chat \
  --message "Add due dates to todos" \
  --project-dir /path/to/demo-todo-app
```

---

## 8. Pipeline (Issue → PR)

When feature intake creates a GitHub Issue with `agent-route:pending`:

```bash
node dist/cli.js run-pipeline --issue 42 --project-dir /path/to/demo-todo-app
```

Or label an issue `agent-route:pending` in GitHub → workflow runs automatically (if client has `ai-platform-pipeline.yml`).

---

## 9. Troubleshooting

| Problem | Fix |
|---------|-----|
| `ANTHROPIC_API_KEY is required` | Export key before CLI |
| Node errors on import | Use Node **20+** (`node -v`) |
| Slack URL verification fails | Server running? ngrok URL correct? `/slack/events` path |
| Bot doesn't reply | Bot invited to channel? `SLACK_BOT_TOKEN` set? Check server logs |
| Agent replies but no files | Ask explicitly to write knowledge; check `Applied:` in logs |
| `Agent not licensed` | Add `channel-pack` to `purchased_agents` or leave empty |
| MCP Slack errors | Token needs chat scopes; try `show-agent` to verify mcp_servers |

---

## 10. What to read next

| Topic | Doc |
|-------|-----|
| **Slack runbook (per-agent)** | [slack-setup.md](slack-setup.md) |
| **Secrets & bot setup (full)** | [secrets-and-setup.md](secrets-and-setup.md) |
| Agent catalog & SKU | [cloud-agent-catalog.md](cloud-agent-catalog.md) |
| Channel architecture | [channel-integration.md](channel-integration.md) |
| Commercial / billing | [commercial-licensing.md](commercial-licensing.md) |
| Client onboarding | [project-onboarding.md](project-onboarding.md) |

---

## Quick reference — agent files

```
cloud-agents/
├── catalog.yaml              # SKU registry
├── agents/
│   ├── requirements-conversation-agent.agent.yaml   ← edit agent here
│   ├── architecture-conversation-agent.agent.yaml
│   └── feature-intake-conversation-agent.agent.yaml
runtime/src/
├── agent-definition.ts       # loader
├── mcp-agent-client.ts         # Claude API + MCP
├── channels/orchestrator.ts    # inbound → agent → actions
└── slack-events-server.ts      # Slack Events HTTP
```

**To change agent behavior:** edit `system:` in the `.agent.yaml` file — no TypeScript required for prompt changes.
