# Troubleshooting Guide

## Agent stuck in blocked

1. Check `agent-route:blocked` and Issue comments for `EscalationRecord`.
2. Resolve Knowledge Owner or Governance gate.
3. Re-run `workflow-agent` via `workflow_dispatch`.

## Contract validation fails

1. Check Actions log for `contract-validate.yml`.
2. Fix JSON against `contracts/schemas/{Name}.v1.json`.
3. If schema passes, review `contract-validator-agent` semantic errors.

## arch-review:failed

1. Read `ArchitectureReviewReport@1.0` on PR.
2. Fix via implement-agent `mode: fix` or escalate to Architect.

## Context pack too large

1. Verify tier in `ContextPack.v1.spec.yaml`.
2. Check compression rules applied in context-build logs.

## Platform version mismatch

Update project `platform_version` or upgrade platform per `docs/guides/platform-upgrade.md`.
