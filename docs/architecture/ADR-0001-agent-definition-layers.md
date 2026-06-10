# ADR-0001: Agent definition layers

**Status:** Accepted  
**Date:** 2026-06-09  
**Change / PR:** Architecture checkup + MCP agent refactor

## Context

An agent is described in several places, which previously caused drift
(duplicated system prompts, mismatched models, orphaned manifests):

- `cloud-agents/agents/*.agent.yaml` — Claude Console format
- `runtime/config/agents/*.runtime.yaml` — pipeline orchestration
- `runtime/src/agents/*.ts` — executable logic
- `prompts/{agent}/*` — production prompt packs
- `contracts/schemas/*.v1.json` — output contract schemas

We need a single, documented model of which layer owns what, plus a guardrail
that prevents silent divergence.

## Decision

Each layer has one clear responsibility:

| Layer | Owns | Consumed by |
|-------|------|-------------|
| `cloud-agents/agents/*.agent.yaml` | **Canonical identity**: name, model, max_tokens, system, MCP servers, tools, `output_contract`, SKU | Cloud/conversation runtime (`McpAgentClient`, `CloudAgentClient`), catalog, provisioning |
| `runtime/config/agents/*.runtime.yaml` | **Pipeline orchestration**: enabled, input_contracts, required_context, retry, failure_handling, next_agent, skills | `dispatcher` via `loadRuntimeDef` |
| `runtime/src/agents/*.ts` | **Code logic**: `buildOutputInstructions`, `validateOutput`, `normalizeOutput` | `dispatcher` via `getAgentModule` |
| `prompts/{agent}/*` | **Layered production packs**: system-prompt, execution, self-review, checklists, standards | `dispatcher` via `prompt-loader` |
| `contracts/schemas/*.v1.json` | **Output contract schema** | contract validation |

Rules:

1. The cloud catalog (15 sellable agents) is a **subset** of the full agent
   registry (20 agents in `registries/agent-registry.yaml`). Pipeline-only / meta
   agents (architecture-review, docs, release, migration, fullstack/infra
   implement, context-builder, contract-validator, handoff-summarizer) keep
   runtime + TS + prompt layers but are not in the cloud catalog.
2. Pipeline agents that ARE in the catalog must keep `model` and `output_contract`
   in agreement between `.agent.yaml` and `*.runtime.yaml`.
3. `CodeChanges` is validated by code (code-guard + TS module), not a JSON schema.
4. Conversation agents (`tier: channel`) have **no** runtime/config or TS module —
   they run entirely from their `.agent.yaml` `system` via the MCP runtime.

## Consequences

### Positive

- One documented owner per concern; no more "which file is the truth?"
- `validate-agents` enforces the invariants in CI.
- Orphaned `manifests/` removed; dead conversation-prompt code removed.

### Negative / trade-offs

- Pipeline system prompts still live in `prompts/` packs (richer), so an
  agent's full prompt is assembled from `.agent.yaml` identity + packs rather
  than a single file. This is intentional layering, not duplication.

## Alternatives considered

1. **Single `.agent.yaml` as the only source** (move system prompts out of
   `prompts/`): rejected for now — prompt packs carry self-review/checklist/
   standards content that is genuinely separate from base identity, and the
   pipeline is battle-tested against them.
2. **Generate `.agent.yaml` from packs**: deferred; revisit if drift recurs.

## References

- `runtime/src/validate-agents.ts` (guardrail)
- `registries/agent-registry.yaml` (20 agents)
- `cloud-agents/catalog.yaml` (15 sellable)
- Blueprint v2.1
