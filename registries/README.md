# registries/

Authoritative **inventories** of what exists on the platform. Other layers
(catalog, runtime, prompts) must stay consistent with these.

## Layout

| Path | Purpose |
|------|---------|
| `agent-registry.yaml` | All agents grouped by class (`meta`, `sdlc`, `on_demand`) — **20 total** |
| `skill-registry.yaml` | All registered skills (core / sdlc / technology) |

## Agent classes

| Class | Examples |
|-------|----------|
| `meta` | workflow, context-builder, contract-validator, handoff-summarizer |
| `sdlc` | triage, requirements, product-spec, technical-spec, plan, implement (frontend/backend/fullstack/infra), architecture-review, review, qa, security, docs, release |
| `on_demand` | migration |

## Relationship to the catalog

The cloud catalog ([`cloud-agents/catalog.yaml`](../cloud-agents/catalog.yaml))
sells **15** of these 20 agents. The registry is the superset; the catalog is the
sellable subset. See [ADR-0001](../docs/architecture/ADR-0001-agent-definition-layers.md).

## Consistency

`node dist/cli.js validate-agents` cross-checks registry ↔ catalog ↔ runtime ↔
TS modules ↔ contracts.

## Related

- [`agents/`](../agents/README.md)
- [`skills/`](../skills/README.md)
