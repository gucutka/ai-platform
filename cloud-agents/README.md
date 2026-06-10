# cloud-agents/

Canonical agent definitions in **Claude Console format** (`.agent.yaml`) plus the
commercial catalog. This is the source of truth for agent **identity** (system
prompt, model, tools, MCP servers, output contract, SKU).

## Layout

| Path | Purpose |
|------|---------|
| `catalog.yaml` | SKUs, packages, tiers, `agent → definition` mapping (15 sellable) |
| `agents/*.agent.yaml` | **Canonical** agent definitions (Claude format) |
| `deployments.local.yaml` | Local provisioning state (generated; gitignored where applicable) |

## `.agent.yaml` shape

```yaml
name: Requirements conversation agent
description: ...
model: claude-opus-4-5
max_tokens: 4096
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
  - type: contract_toolset       # pipeline agents
    output_contract: TriageResult@1.0
metadata:
  agent_id: requirements-conversation-agent
  sku: channel-ba
  cloud_agent_id: ...            # written by `register-cloud-agent`
```

## Tool types

| Type | Purpose |
|------|---------|
| `mcp_toolset` | Slack / GitHub / external tools via Claude MCP connector |
| `platform_toolset` | Platform actions (write_knowledge, write_adr, create_github_issue, …) |
| `contract_toolset` | Pipeline JSON contract output (TriageResult, BusinessRequirements, …) |

## Catalog vs registry

The catalog (15 sellable agents) is a **subset** of the full registry
([`registries/agent-registry.yaml`](../registries/agent-registry.yaml), 20 agents).
Pipeline-only / meta agents are not sold individually. See
[ADR-0001](../docs/architecture/ADR-0001-agent-definition-layers.md).

## CLI

```bash
node dist/cli.js list-agent-definitions
node dist/cli.js show-agent --agent triage-agent
node dist/cli.js list-cloud-agents --sellable true
node dist/cli.js provision-cloud-agents
node dist/cli.js register-cloud-agent --agent triage-agent --cloud-agent-id <id>
node dist/cli.js validate-agents          # cross-layer consistency guardrail
```

## Related

- [Cloud agent catalog guide](../docs/guides/cloud-agent-catalog.md)
- [Claude Cloud Agents integration](../docs/guides/claude-cloud-agents-integration.md)
- [`agents/`](../agents/README.md) — human-facing specs & layered prompts
