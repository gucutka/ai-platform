# Project Onboarding Guide

See `governance/onboarding-checklist.md` and [Knowledge Owners Handbook](../handbooks/knowledge-owners-handbook.md).

## Minimal Steps

### Cloud (recommended — no local CLI)

In the **ai-platform** repository: **Actions → Create Client Project → Run workflow**

| Input | Example |
|-------|---------|
| `project_id` | `b2b-todo-saas` |
| `target_org` | your GitHub org (default: repo owner) |
| `visibility` | `private` |

Creates a new GitHub repo with `.ai-platform/`, `docs/knowledge/`, `.github/workflows/`, sets `AI_PLATFORM_REPOSITORY` variable.

Requires secret **`GH_PAT`** with permission to create repos in the org (or use org-owned `GITHUB_TOKEN` if policy allows).

### Local bootstrap

1. **Bootstrap** (no fork):
   ```bash
   node dist/cli.js create-client-project \
     --target /path/to/client \
     --project-id CLIENT_ID \
     --platform-owner YOUR_ORG \
     --tier standard
   ```
   Or legacy: `onboard-project` (same core template, without ISSUE_TEMPLATE / README).
2. Push to GitHub manually (`gh repo create ...`).
3. Set repository variable `AI_PLATFORM_REPOSITORY` = `YOUR_ORG/ai-platform`.
4. Add secrets: `ANTHROPIC_API_KEY`, `GH_PAT`, `SLACK_*` (optional).
5. Bind Slack channels in `.ai-platform/channels.yaml`.
6. Run pilot Issue; label `agent-route:pending`.

See [multi-repo-workflows.md](./multi-repo-workflows.md).

## Knowledge validation

End-to-end check:

```bash
cd ai-platform/runtime && npm run build
node dist/cli.js knowledge-sync --project-dir /path/to/project
jq '.stats' /path/to/project/.ai-platform/knowledge/index.json
node dist/cli.js build-context --issue N --agent product-spec-agent --project-dir /path/to/project
```

- `index.json` lists all knowledge files with `approved` / `draft` status.
- ContextPack `sections.knowledge_skipped_draft` > 0 when drafts exist.
- Product spec agent cites `docs/knowledge/product/` when present.

## Compatibility

`platform_version: "2.1.0"` must match `governance/platform-compatibility-matrix.yaml`.
