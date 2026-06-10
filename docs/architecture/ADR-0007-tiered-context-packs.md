# ADR-0007: Tiered, token-budgeted ContextPacks

**Status:** Accepted (retroactive)  
**Date:** 2026-06-09  
**Change / PR:** Documentation of foundational design

## Context

Agents need rich context (issue, manifest, knowledge, code) but LLM cost and
context limits make "send everything" infeasible and unpredictable.

## Decision

Assemble a **ContextPack** per dispatch, bounded by tier:

- Structure defined by `context/packs/ContextPack.v1.spec.yaml` and
  `contracts/schemas/ContextPack.v1.json`.
- Retrieval driven by `context/rules/retrieval-strategy.yaml` (what to include
  per agent/stage).
- Token budgets by tier `T0`–`T3` via `context/rules/token-budget-rules.yaml`.
- Packs carry `refs`, `context_pack_hash`, `freshness`, and `token_budget` for
  reproducibility and caching.

## Consequences

### Positive

- Predictable cost; budgets enforced before invocation.
- Reproducible runs via content hashes; cache-friendly.

### Negative / trade-offs

- Retrieval tuning needed — too little context degrades quality.
- Extra build step (`context-builder-agent`) per dispatch.

## Alternatives considered

1. **Full-repo context** — rejected: cost/limits, noise.
2. **Fixed context per agent** — rejected: ignores issue specificity.

## References

- [`context/`](../../context/README.md)
- `contracts/schemas/ContextPack.v1.json`
- [Pipeline trace](../handbooks/pipeline-trace.md)
