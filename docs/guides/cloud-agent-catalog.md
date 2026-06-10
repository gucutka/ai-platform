# Cloud Agent Catalog

Commercial catalog of Claude agents — one SKU per sellable agent.

## Layout

| Path | Purpose |
|------|---------|
| `cloud-agents/catalog.yaml` | SKUs, packages, agent → definition mapping |
| `cloud-agents/agents/*.agent.yaml` | **Canonical** — Claude Console format (system, MCP, tools, contract) |
| `cloud-agents/deployments.local.yaml` | Local provisioning state (generated) |

> Legacy `cloud-agents/manifests/*.yaml` were removed — every catalog entry now points to a `.agent.yaml`. See [ADR-0001](../architecture/ADR-0001-agent-definition-layers.md) for how this layer relates to the pipeline runtime.

Consistency across layers is enforced by:

```bash
node dist/cli.js validate-agents
```

## Agent definition format

Each `.agent.yaml` file:

```yaml
name: Requirements conversation agent
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

## Provision / list

```bash
cd runtime && npm run build
node dist/cli.js provision-cloud-agents
node dist/cli.js list-cloud-agents --sellable true
```

## Register Claude Console agent ID (optional)

For managed agents registered in Claude Console:

```bash
node dist/cli.js register-cloud-agent \
  --agent requirements-agent \
  --cloud-id ag_xxxxxxxx
```

Writes `metadata.cloud_agent_id` into the `.agent.yaml` file.

## Invoke (test)

```bash
export CLAUDE_RUNTIME=cloud-agents
export ANTHROPIC_API_KEY=...
node dist/cli.js invoke-cloud-agent \
  --agent requirements-agent \
  --message "Draft requirements for user login feature"
```

Sessions persist under `.ai-platform/cloud-sessions/`.

## Client licensing

In client `manifest.yaml`:

```yaml
purchased_agents:
  - ba-pack          # package from catalog
  - review-agent     # or individual agent
```

Empty list = all agents allowed.

## Packages

| Package | Agents |
|---------|--------|
| `ba-pack` | requirements, product-spec |
| `architect-pack` | technical-spec, plan |
| `channel-pack` | intake, discovery, architecture, feature conversation agents |
| `full-sdlc` | full pipeline set |

Conversation agents use **Slack MCP** for outbound messages. See [getting-started.md](getting-started.md) and [channel-integration.md](channel-integration.md).

## Commercial pricing

Reference list prices and package definitions live in `catalog.yaml` → `commercial`. See [commercial-licensing.md](commercial-licensing.md).

```bash
node dist/cli.js list-sellable-packages
node dist/cli.js commercial-summary --project-dir ./client
```
