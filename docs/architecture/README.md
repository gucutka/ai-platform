# Architecture Decision Records

When platform behavior diverges from [Blueprint v2.1](./blueprint-v2.1.md), record an ADR before merging.

## Process

1. Copy [ADR-template.md](./ADR-template.md) → `ADR-NNN-short-title.md`
2. Fill context, decision, consequences
3. Link ADR in PR and handbook if user-facing
4. Minor implementation details within an approved plan do **not** need ADRs

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](ADR-0001-agent-definition-layers.md) | Agent definition layers | Accepted |
| [0002](ADR-0002-versioned-json-contracts.md) | Versioned JSON contracts as the agent interface | Accepted |
| [0003](ADR-0003-github-actions-orchestration.md) | GitHub Actions as the orchestration substrate | Accepted |
| [0004](ADR-0004-dual-claude-runtime.md) | Dual Claude runtime (Cloud Agents + Messages/MCP) | Accepted |
| [0005](ADR-0005-channel-abstraction.md) | Channel abstraction for conversational SDLC | Accepted |
| [0006](ADR-0006-knowledge-layer-governance.md) | Knowledge layers with approval gates | Accepted |
| [0007](ADR-0007-tiered-context-packs.md) | Tiered, token-budgeted ContextPacks | Accepted |

> ADRs 0002–0007 are **retroactive** — they document foundational decisions already
> implemented in Blueprint v2.1, so future changes have a baseline to diverge from.

## Triggers for new ADR

- New external integration (auth provider, LLM runtime, storage)
- Breaking change to contract schemas or manifest fields
- Replacing GitHub Actions with standalone orchestrator service
- Multi-tenant isolation model change
