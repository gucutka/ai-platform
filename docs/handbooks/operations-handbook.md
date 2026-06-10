# Operations Handbook

## Daily Operations

- Monitor agent failure rate and DLQ
- Review token burn via cost-report workflow
- Audit trail export for regulated clients

## Workflows

| Workflow | Trigger |
|----------|---------|
| issue-routing.yml | Issue events |
| context-build.yml | Pre-agent |
| architecture-review.yml | PR |
| review.yml | PR after arch-review:passed |
| qa.yml | Post-review |
| security.yml | risk:high |
| docs.yml | Merge |
| release.yml | Post-docs |
| knowledge-sync.yml | Schedule / knowledge push |

## Incidents

See `docs/operations/troubleshooting.md`.

## Multi-Project

Partition by `project_id` in manifest; installation registry per GitHub org.
