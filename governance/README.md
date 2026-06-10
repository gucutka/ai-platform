# governance/

Platform-wide **policy, audit, and compatibility** configuration. These files are
read by the runtime and CI to enforce guardrails and produce audit trails. See the
[governance handbook](../docs/handbooks/governance-handbook.md).

## Layout

| Path | Purpose |
|------|---------|
| `architecture-governance.yaml` | Architect gate rules, exception policy |
| `audit-trail.yaml` | What is recorded for each agent action / decision |
| `cost-tracking.yaml` | Token/cost accounting rules and budgets |
| `failure-recovery.yaml` | DLQ, retry, and escalation behavior |
| `platform-compatibility-matrix.yaml` | Platform ↔ contracts/agents/skills versions |
| `onboarding-checklist.md` | Steps to onboard a new client repo |
| `adr-template.md` | ADR template for **client-repo** technical decisions |

> Platform ADRs use [`docs/architecture/ADR-template.md`](../docs/architecture/ADR-template.md).
> `governance/adr-template.md` is the template shipped to client repos.

## Where these are enforced

- **Architect gate** → [architect-gate handbook](../docs/handbooks/architect-gate-handbook.md), `.github/workflows/architecture-review.yml`
- **Cost** → `.github/workflows/cost-report.yml`, `node dist/cli.js cost-report`
- **Audit** → `node dist/cli.js audit-export`
- **Failure recovery** → `node dist/cli.js dlq-list`

## Related

- [`policies/`](../policies/README.md) — routing/escalation/scope rules
- [Operations handbook](../docs/handbooks/operations-handbook.md)
