# Agent Evaluation Framework

## Pipeline trace (Level 1)

Every pipeline run writes audit events and a `PipelineRun` summary.  
See [pipeline-trace.md](../docs/handbooks/pipeline-trace.md).

## AgentExecutionReport

Saved after each quality agent run to:
`.ai-platform/evaluation/{issue_id}/{agent}-{timestamp}.json`

Schema: `AgentExecutionReport.v1.json`  
Scoring: `scoring-rules.yaml`

## Agent Score (0–100)

| Agent | Production ready |
|-------|------------------|
| implement agents | ≥ 85 |
| review-agent | ≥ 85 |
| qa-agent | ≥ 85 |

## Optimization

See `prompts/optimization/framework.md` and `.ai-platform/optimization/`.
