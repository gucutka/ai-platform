# templates/

Everything stamped into a **client repo** at onboarding, plus app scaffolds and
GitHub metadata templates.

## Layout

| Path | Purpose |
|------|---------|
| `project-repo/` | Skeleton dropped into a client repo (`.ai-platform/`, `.github/`, `docs/`) |
| `apps/` | App scaffolds (`express-api`, `nextjs-minimal`) + `catalog.yaml` |
| `ISSUE_TEMPLATE/` | Issue forms (`bug.yml`, `feature.yml`) |
| `PULL_REQUEST_TEMPLATE.md` | PR template |
| `labels.json` | Label taxonomy (incl. `agent-route:*`) |
| `project-fields.json` / `project-sync.yaml` | GitHub Projects fields & sync |
| `project-lifecycle.yaml` | Pre-dev → development phases |
| `tier-presets.yaml` | Client tier presets (standard/enterprise/regulated) |
| `channels.yaml` / `notifications.yaml` | Channel + notification config |
| `automation-contracts.yaml` | Automation hook contracts |

## App templates

Used by `scaffold-app` / `onboard-project`:

```bash
node dist/cli.js list-app-templates
node dist/cli.js scaffold-app --template express-api
```

Each app template has a `skeleton/` (copied into the repo) and a manifest entry in
`apps/catalog.yaml`.

## Conventions

- Labels in `labels.json` must include the `agent-route:*` set the pipeline depends on.
- Keep `project-repo/.ai-platform/manifest.yaml` in sync with `runtime/src/types.ts` `Manifest`.

## Related

- [Project onboarding](../docs/guides/project-onboarding.md) · [App templates guide](../docs/guides/app-templates.md)
