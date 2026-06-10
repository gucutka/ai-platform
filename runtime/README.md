# AI Platform Runtime

Node.js dispatcher for the Agentic SDLC pipeline.

## Setup

```bash
cd runtime && npm ci && npm run build
export ANTHROPIC_API_KEY=...
export GITHUB_TOKEN=...
export GITHUB_REPOSITORY=owner/repo
export PROJECT_DIR=/path/to/client-project
```

## CLI

```bash
# Full pipeline
node dist/cli.js run-pipeline --issue 1 --project-dir /path/to/demo-todo-app

# Single agent
node dist/cli.js dispatch --issue 1 --agent triage-agent

# Onboard new client
node dist/cli.js onboard-project --target ./client --project-id acme --tier standard
```

## Pipeline path

`triage-agent` → `workflow-agent` → spec chain (by risk) → `plan-agent` → implement → QA/CI → PR → `review-agent` → optional security → automerge → post-merge.

See `docs/handbooks/` and `PRODUCTION_READINESS_REPORT.md`.
