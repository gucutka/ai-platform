# context/

Configuration for **ContextPack** assembly — the tiered, token-budgeted bundle of
issue + manifest + knowledge + code that each agent receives. See
[ADR-0007](../docs/architecture/ADR-0007-tiered-context-packs.md).

## Layout

| Path | Purpose |
|------|---------|
| `packs/ContextPack.v1.spec.yaml` | ContextPack structure spec (tracked) |
| `packs/*.json` | Generated packs per dispatch (gitignored) |
| `rules/retrieval-strategy.yaml` | What to retrieve per agent / stage |
| `rules/token-budget-rules.yaml` | Tier limits (T0–T3) and budget enforcement |

## Concept

A ContextPack is built per dispatch and carries everything an agent needs:

- `issue`, `manifest`, prior `contracts`
- relevant `files` (retrieval-strategy driven)
- `skills_text`, `refs`, `token_budget`, `freshness`

Tiers (`T0`–`T3`) bound prompt size so cost stays predictable. The builder lives in
the runtime (`context-builder-agent` / `runtime/src`), and the schema is
[`contracts/schemas/ContextPack.v1.json`](../contracts/schemas/ContextPack.v1.json).

## Related

- [`contracts/`](../contracts/README.md)
- [`knowledge/`](../knowledge/README.md)
- [Pipeline trace](../docs/handbooks/pipeline-trace.md)
