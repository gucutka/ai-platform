# Multi-repo reusable workflows

Client project repos call platform workflows from `ai-platform` without copying runtime code.

## Prerequisites

| Item | Where |
|------|--------|
| `ANTHROPIC_API_KEY` | Repository or org secret |
| `GITHUB_TOKEN` | Default (needs `issues: write`, `pull-requests: write`, `actions: read`) |
| `.ai-platform/manifest.yaml` | Project repo |
| `.ai-platform/project-sync.yaml` | Optional — GitHub Projects v2 mapping |

For split repos (platform not in monorepo), set repository variable:

```yaml
AI_PLATFORM_REPOSITORY: your-org/ai-platform
```

## Label → Project sync

Any label change triggers field sync:

```yaml
# .github/workflows/sync-project-fields.yml
name: Sync Project Fields
on:
  issues:
    types: [labeled]
jobs:
  sync:
    uses: your-org/ai-platform/.github/workflows/sync-project-fields.yml@main
    with:
      issue_number: ${{ github.event.issue.number }}
    secrets: inherit
```

Configure `.ai-platform/project-sync.yaml`:

```yaml
version: "1.0"
enabled: true
owner: your-org
owner_type: organization
project_number: 1
```

Field names must match `templates/project-fields.json` (**Agent Route**, **Risk**, **Status**, **Blocked**).

## Label-only issue routing

Full triage chain without `workflow_dispatch`:

```yaml
# .github/workflows/issue-routing.yml
name: Issue Routing
on:
  issues:
    types: [labeled]
jobs:
  route:
    if: github.event.label.name == 'agent-route:pending'
    uses: your-org/ai-platform/.github/workflows/issue-routing.yml@main
    with:
      issue_number: ${{ github.event.issue.number }}
    secrets: inherit
```

Flow: **sync project** → **triage-agent** → **workflow-agent**.

Alternative: use **AI Platform Pipeline** (`run-pipeline`) on the same label for the full automated path instead of routing-only.

## QA status from CI

When the **Test** workflow completes, sync `ci:passed` / `ci:failed` to the linked issue and project board:

```yaml
# .github/workflows/qa-status-sync.yml
name: QA Status Sync
on:
  workflow_run:
    workflows: ["Test"]
    types: [completed]
jobs:
  resolve:
    runs-on: ubuntu-latest
    outputs:
      pr_number: ${{ steps.pr.outputs.number }}
      conclusion: ${{ github.event.workflow_run.conclusion }}
    steps:
      - id: pr
        run: |
          PRS='${{ toJson(github.event.workflow_run.pull_requests) }}'
          echo "number=$(echo "$PRS" | jq -r '.[0].number // empty')" >> "$GITHUB_OUTPUT"
  sync:
    needs: resolve
    if: needs.resolve.outputs.pr_number != ''
    uses: your-org/ai-platform/.github/workflows/qa-status-sync.yml@main
    with:
      pr_number: ${{ fromJSON(needs.resolve.outputs.pr_number) }}
      conclusion: ${{ needs.resolve.outputs.conclusion }}
    secrets: inherit
```

PR body must reference the issue (`Closes #N`).

## CLI (local / custom runners)

```bash
node dist/cli.js sync-project --issue 7
node dist/cli.js route-issue --issue 7
node dist/cli.js qa-status-sync --pr 12 --conclusion success
```

## Permissions note

`GITHUB_TOKEN` for Projects v2 needs `project` scope when using organization projects. Use a PAT or GitHub App token with `read:project` and `write:project` if sync fails with permission errors.
