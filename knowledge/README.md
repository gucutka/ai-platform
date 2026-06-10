# knowledge/

Templates and governance for the **layered knowledge base** that grounds agents.
Per-client knowledge lives in the *client repo* (under `docs/knowledge/`); this
folder holds the **platform-side templates and rules**. See
[ADR-0006](../docs/architecture/ADR-0006-knowledge-layer-governance.md) and the
[knowledge-owners handbook](../docs/handbooks/knowledge-owners-handbook.md).

## Layers

| Layer | Owner | Purpose |
|-------|-------|---------|
| `business/` | Business Analyst | Domain rules, users, scope |
| `product/` | Product Analyst | Product specs, priorities |
| `technical/` | Architect | Stack, modules, ADRs |
| `platform/` | Platform team | Platform-level knowledge & governance |

Each layer has a `templates/` folder with the canonical document shapes.

## Governance

| Path | Purpose |
|------|---------|
| `governance/approval-flows.yaml` | Who approves a layer before it unblocks downstream agents |
| `governance/ownership-model.yaml` | Layer ownership and edit rights |

Knowledge is **gated**: a layer must be approved before dependent agents
(e.g. architect requires approved business knowledge) proceed. Enforcement flags
live in the client manifest (`knowledge_enforcement`, `knowledge_require_approval`).

## Flow

1. Conversation agents (BA, architect) draft knowledge via `write_knowledge`.
2. Owner approves the layer (`approve_layer`).
3. Approved knowledge enters ContextPacks for downstream pipeline agents.

## Related

- [`context/`](../context/README.md) — how knowledge enters prompts
- [`governance/`](../governance/README.md)
- [Architecture conversation guide](../docs/guides/architecture-conversation.md)
