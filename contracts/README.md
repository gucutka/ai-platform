# contracts/

The **typed interface between agents**. Every pipeline handoff is a versioned
JSON contract validated against a schema. See
[ADR-0002](../docs/architecture/ADR-0002-versioned-json-contracts.md).

## Layout

| Path | Purpose |
|------|---------|
| `schemas/*.v1.json` | JSON Schemas for each contract (TriageResult, BusinessRequirements, …) |
| `agent-contract-model.v1.yaml` | Which agent emits/consumes which contract |
| `compatibility-matrix.yaml` | Contract ↔ platform/agent version compatibility |
| `versioning-rules.yaml` | SemVer rules for evolving contracts |
| `rules/validation-rules.yaml` | Cross-field / business validation rules |
| `artifacts/` | Generated contract instances (gitignored) — see [artifacts/README](artifacts/README.md) |

## Naming

`{ContractName}.v{MAJOR}.json` — referenced in agents as `ContractName@MAJOR.MINOR`
(e.g. `TriageResult@1.0`).

## Validation

- Runtime: `runtime/src/contracts.ts` (`loadContractToolSchema`, `normalizeContract`, `validateContract`).
- CI: [`.github/workflows/contract-validate.yml`](../.github/workflows/contract-validate.yml) (ajv).
- Code-validated contracts (no JSON schema, validated by code) — e.g. `CodeChanges`.

## Evolving a contract

1. Additive/optional change → bump **minor**, keep `v1` schema file.
2. Breaking change → new `vN` schema + update `compatibility-matrix.yaml` + write an ADR.
3. Run `node dist/cli.js validate-agents` to confirm agent ↔ contract alignment.

## Related

- [Agent handbook](../docs/handbooks/agent-handbook.md)
- [`registries/agent-registry.yaml`](../registries/agent-registry.yaml)
