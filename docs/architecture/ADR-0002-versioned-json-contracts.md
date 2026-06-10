# ADR-0002: Versioned JSON contracts as the agent interface

**Status:** Accepted (retroactive)  
**Date:** 2026-06-09  
**Change / PR:** Documentation of foundational design

## Context

Agents must hand off work to each other (triage → plan → implement → review …)
across process and even runtime boundaries (GitHub Actions jobs, Cloud Agents,
local CLI). Free-form text handoffs are unverifiable and brittle.

## Decision

Every agent handoff is a **versioned JSON contract**:

- Each contract has a JSON Schema in `contracts/schemas/{Name}.v1.json`.
- Agents declare an `output_contract` (e.g. `TriageResult@1.0`).
- The runtime normalizes (`normalizeContract`) and validates (`validateContract`)
  output before it is accepted.
- Compatibility and evolution are governed by `contracts/compatibility-matrix.yaml`
  and `contracts/versioning-rules.yaml`.
- A few contracts (e.g. `CodeChanges`) are **code-validated** rather than
  schema-validated, by design.

## Consequences

### Positive

- Deterministic, testable handoffs; CI can validate payloads (ajv).
- Runtime-agnostic: the same contract crosses Actions / Cloud Agents / CLI.
- `validate-agents` can enforce agent ↔ contract alignment.

### Negative / trade-offs

- Schema maintenance overhead; breaking changes need a new `vN` + ADR.
- Model output must be coerced (`normalizeContract`) to absorb LLM quirks.

## Alternatives considered

1. **Free-form text + parsing** — rejected: unverifiable, fragile.
2. **Protobuf/Avro** — rejected: heavier tooling, poor fit for LLM JSON output.

## References

- [`contracts/`](../../contracts/README.md)
- `runtime/src/contracts.ts`
- `.github/workflows/contract-validate.yml`
