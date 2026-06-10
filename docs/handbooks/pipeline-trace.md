# Pipeline Trace (Level 1 Audit)

Centralized trace for each issue run via **GitHub Actions artifacts** + **issue summary comment**.

## Where to look

| Layer | Location |
|-------|----------|
| Human summary | Issue comment `## Pipeline Run \`run-{issue}-{github_run_id}\`` |
| Full dump | Actions → workflow run → **Artifacts** → `ai-platform-trace-issue-{N}` |
| Contracts | `.ai-platform/runs/{issue_id}/*.json` (inside artifact) |
| Event log | `.ai-platform/audit/{issue_id}/{run_id}.events.jsonl` |
| Summary JSON | `.ai-platform/audit/{issue_id}/{run_id}.pipeline-run.json` |
| Quality scores | `.ai-platform/evaluation/{issue_id}/` (quality agents only) |

## Audit events (JSONL)

One line per event:

- `pipeline.started` / `pipeline.completed` / `pipeline.failed`
- `agent.started` / `agent.completed` / `agent.failed`
- `pr.created`

Fields align with `governance/audit-trail.yaml`: `issue_id`, `contract_hash`, `token_usage`, GitHub run metadata.

## PipelineRun contract

Schema: `contracts/schemas/PipelineRun.v1.json`

Posted collapsed in the pipeline summary issue comment and saved under `.ai-platform/audit/`.

## Retention

Artifacts: **90 days** (configurable in `ai-platform-pipeline.yml` → `retention-days`).
