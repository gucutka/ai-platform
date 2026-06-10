# Project Lifecycle

Phases before the development pipeline runs.

## Phases

| Phase | Requirement |
|-------|-------------|
| **intake** | Repo scaffolded (`manifest.yaml` + `package.json`) |
| **discovery** | `knowledge:business-approved` |
| **architecture** | `knowledge:technical-approved` |
| **development** | Enabled when discovery + architecture complete |

## Config

Project file: `.ai-platform/project-lifecycle.yaml`  
Default template: `templates/project-lifecycle.yaml`

Disable gating:

```yaml
# manifest.yaml
lifecycle_enabled: false
```

## Check status

```bash
node dist/cli.js lifecycle-status --project-dir /path/to/client
```

## Pipeline behavior

`run-pipeline` checks lifecycle before triage. If development is blocked:

- Label `agent-route:blocked` applied
- Comment with phase checklist posted
- Pipeline stops with clear error

Resume development after approving knowledge layers:

```bash
node dist/cli.js knowledge-approve --layer business --status approved
node dist/cli.js knowledge-approve --layer technical --status approved
node dist/cli.js knowledge-sync
```

Or apply labels `knowledge:business-approved` / `knowledge:technical-approved` on the issue.
