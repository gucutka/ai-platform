# .github/workflows/

Reusable **GitHub Actions** workflow library — the orchestration substrate of the
platform. GitHub Actions is the runtime that dispatches agents and enforces gates.
See [ADR-0003](../../docs/architecture/ADR-0003-github-actions-orchestration.md).

> This is the **only** workflow location (executed by GitHub). Client repos receive
> the workflows they need at onboarding from `templates/project-repo/.github/`.

## Pipeline (Issue → PR → merge)

| Workflow | Stage |
|----------|-------|
| `issue-routing.yml` | Route inbound issues to agents |
| `agent-dispatch.yml` | Invoke a single agent with a ContextPack |
| `context-build.yml` | Build the ContextPack |
| `pipeline.yml` | End-to-end pipeline orchestration |
| `pipeline-resume.yml` | Resume a failed pipeline from a stage |
| `pr-create.yml` | Open the PR from CodeChanges |

## Quality gates

| Workflow | Gate |
|----------|------|
| `architecture-review.yml` | Architect gate |
| `review.yml` | Code review |
| `qa.yml` / `qa-status-sync.yml` | QA + status |
| `security.yml` | Security scan |
| `contract-validate.yml` | Contract schema validation (ajv) |
| `agents-validate.yml` | Cross-layer agent consistency guardrail |

## Channels & events

| Workflow | Purpose |
|----------|---------|
| `create-client-project.yml` | Bootstrap new client repo on GitHub (workflow_dispatch) |
| `channel-events.yml` | Slack/webhook events via `repository_dispatch` |
| `webhook-receiver.yml` | Platform webhook receiver |

## Supporting

| Workflow | Purpose |
|----------|---------|
| `knowledge-sync.yml` | Sync knowledge layers |
| `optimization-sync.yml` | Prompt-optimization hints sync |
| `docs.yml` | Docs generation |
| `release.yml` | Release |
| `cost-report.yml` | Cost reporting |
| `sync-project-fields.yml` | GitHub Project fields |

## Conventions

- Prefer `workflow_call` reusable workflows; pass secrets explicitly.
- Pin `actions/*` to major versions; use Node `20`.

## Related

- [Operations handbook](../../docs/handbooks/operations-handbook.md) · [Pipeline trace](../../docs/handbooks/pipeline-trace.md)
- [`runtime/`](../../runtime/README.md) — the CLI invoked by these workflows
