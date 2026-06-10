# Commercial Licensing & Billing

Sell agents and packages by SKU. Runtime enforces entitlements; cost reports attribute usage by SKU.

## Packages (reference pricing)

| Package | List price | Includes |
|---------|------------|----------|
| `ba-pack` | $249/mo | Requirements + product spec agents |
| `architect-pack` | $299/mo | Technical spec + plan agents |
| `channel-pack` | $199/mo | All conversation agents (intake, BA, architect, feature) |
| `full-sdlc` | $1,499/mo | Full pipeline through QA |

Prices are defined in `cloud-agents/catalog.yaml` under `commercial.packages` (sales reference — not auto-charged).

## Client manifest

```yaml
# .ai-platform/manifest.yaml
purchased_agents:
  - ba-pack
  - channel-pack
  # or individual agents:
  # - requirements-agent
```

- **Empty `purchased_agents`** → all catalog agents allowed (dev / pilot default)
- **Non-empty** → only listed packages and agent IDs are licensed

Runtime checks on every `dispatchAgent` and `CloudAgentClient.invoke`.

## CLI

```bash
# What is this project licensed to use?
node dist/cli.js license-status --project-dir ./client

# Sales catalog with list prices
node dist/cli.js list-sellable-packages

# Usage by SKU + entitlements + totals
node dist/cli.js commercial-summary --month 2026-06 --project-dir ./client

# Cost report (includes by_sku table in JSON + GitHub comment)
node dist/cli.js cost-report --month 2026-06 --project-dir ./client
```

## Usage attribution

| Source | Logged to |
|--------|-----------|
| Pipeline agents | Audit `.pipeline-run.json` → `cost-report` line items |
| Cloud / channel agents | `.ai-platform/commercial/usage.jsonl` |

Both roll up into **`by_sku`** in `CostReport` and `commercial-summary`.

## Sales narratives

### BA as a Service (`ba-pack` + `channel-pack`)

1. Client buys **channel-pack** for Slack/webhook discovery with `requirements-conversation-agent`
2. Adds **ba-pack** for GitHub pipeline specs (`requirements-agent`, `product-spec-agent`)
3. Knowledge lands in `docs/knowledge/business/` → approved → development pipeline

### Full SDLC outsourcing (`full-sdlc`)

Issue with `agent-route:pending` → triage → specs → implement → review → QA → PR → merge → release.

Add **channel-pack** for pre-dev if client wants conversational intake before issues.

### Architecture add-on (`architect-pack` + `channel-pack`)

**architecture-conversation-agent** for pre-dev ADRs; **technical-spec-agent** + **plan-agent** in pipeline.

## Provisioning cloud agents

```bash
node dist/cli.js provision-cloud-agents
node dist/cli.js register-cloud-agent --agent requirements-agent --cloud-id ag_xxx
```

See [cloud-agent-catalog.md](cloud-agent-catalog.md).

## Related

- [dev-bridge.md](dev-bridge.md) — feature intake licensing
- [channel-integration.md](channel-integration.md) — channel-pack
- Governance: `token_budget` in manifest for spend caps
