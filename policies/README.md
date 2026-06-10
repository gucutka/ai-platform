# policies/

Declarative **decision rules** that steer the pipeline at runtime. Kept as data
(YAML) so behavior can change without code edits.

## Layout

| Path | Purpose |
|------|---------|
| `routing-rules.yaml` | Issue → agent routing (labels, tiers, complexity) |
| `escalation-rules.yaml` | When/how to escalate to humans (tech-lead, architect) |
| `scope-guard.yaml` | Allowed paths / change-scope limits for implement agents |
| `skill-resolution.yaml` | How an agent's required skills are resolved to skill packs |

## Relationship to other layers

- **Routing** complements `agent-routing` in the client manifest and the
  `workflow-agent`'s decisions.
- **Scope-guard** enforces `allowed_paths` / `infra_allowed_paths` from the manifest.
- **Escalation** pairs with `governance/failure-recovery.yaml`.

## Related

- [`governance/`](../governance/README.md)
- [`skills/`](../skills/README.md)
- [Pipeline trace](../docs/handbooks/pipeline-trace.md)
