# ADR-0006: Knowledge layers with approval gates

**Status:** Accepted (retroactive)  
**Date:** 2026-06-09  
**Change / PR:** Documentation of foundational design

## Context

Agents produce better, safer output when grounded in approved project knowledge.
But knowledge must have **owners** and **approval** so a downstream agent never
builds on unreviewed assumptions.

## Decision

Model knowledge as **owned, layered, gated** documents:

- Layers: `business` (BA), `product` (PA), `technical` (Architect), `platform`.
- Ownership and edit rights: `knowledge/governance/ownership-model.yaml`.
- Approval flow: `knowledge/governance/approval-flows.yaml` — a layer must be
  approved before dependent agents proceed (e.g. architect needs approved
  business knowledge).
- Enforcement is per-client via manifest flags (`knowledge_enforcement`,
  `knowledge_require_approval`, `knowledge_scopes`).
- Approved knowledge flows into ContextPacks
  ([ADR-0007](ADR-0007-tiered-context-packs.md)).

## Consequences

### Positive

- Clear accountability; no silent assumptions downstream.
- Conversation agents can draft (`write_knowledge`) while humans gate (`approve_layer`).

### Negative / trade-offs

- Approval adds latency to the pre-dev phase.
- Requires defined owners per client (onboarding checklist).

## Alternatives considered

1. **Free-for-all knowledge** — rejected: no trust boundary.
2. **Single flat knowledge base** — rejected: no ownership/scoping.

## References

- [`knowledge/`](../../knowledge/README.md)
- [Knowledge-owners handbook](../handbooks/knowledge-owners-handbook.md)
- `runtime/src/types.ts` (`Manifest.knowledge_*`)
