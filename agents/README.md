# Agents Directory

Agents are defined in **Claude Console format** — one YAML file per agent.

## Primary location (edit here)

```
cloud-agents/agents/{agent-id}.agent.yaml
```

Example structure:

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

CLI:

```bash
node dist/cli.js list-agent-definitions
node dist/cli.js show-agent --agent requirements-conversation-agent
```

## Tool types

| Type | Purpose |
|------|---------|
| `mcp_toolset` | Slack, GitHub, Notion, … via Claude MCP connector |
| `platform_toolset` | Platform actions: write_knowledge, write_adr, create_github_issue |
| `contract_toolset` | Pipeline JSON contracts (TriageResult, BusinessRequirements, …) |

## Related layers (see ADR-0001)

| Path | Purpose |
|------|---------|
| `agents/sdlc/*/agent.yaml` | Human docs + routing specs |
| `runtime/config/agents/*.runtime.yaml` | Pipeline orchestration (enabled, retry, next_agent) |
| `runtime/src/agents/*.ts` | Pipeline validateOutput / normalizeOutput hooks |
| `prompts/{agent-id}/` | Production prompt packs (layered: self-review, checklists, standards) |

Each layer's ownership is defined in
[ADR-0001: Agent definition layers](../docs/architecture/ADR-0001-agent-definition-layers.md).
Consistency is enforced by `node dist/cli.js validate-agents`.

Runtime loader: `runtime/src/agent-definition.ts`  
MCP invoke: `runtime/src/mcp-agent-client.ts`

See [getting-started.md](../docs/guides/getting-started.md) for full setup.
