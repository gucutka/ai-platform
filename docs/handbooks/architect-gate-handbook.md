# Architect Review Gate

Knowledge Owner checkpoint between **product spec** and **technical spec / plan**.

## When the gate runs

The gate is **enabled** when either:

- `manifest.gates.architect_review_gate: true`, or
- `manifest.client_tier` is `enterprise` or `regulated`

When **disabled** (default demo: `client_tier: standard`, gate flag `false`), the `architect-gate` pipeline step is skipped.

## Pipeline position

```
product-spec-agent → architect-gate → technical-spec-agent → plan-agent → …
```

## Labels

| Label | Meaning |
|-------|---------|
| `architect-gate:pending` | Waiting for architect review |
| `architect-gate:approved` | Approved — resume pipeline |
| `architect-gate:rejected` | Rejected — blocked until spec updated |

Also sets `agent-route:blocked` while pending.

## Human workflow

1. Pipeline publishes `ProductSpec@1.0` and posts an escalation comment naming `manifest.knowledge_owners.architect`.
2. Architect reviews the product spec on the issue.
3. Add `architect-gate:approved` → GitHub workflow `architect-gate-resume.yml` runs `resume --from technical-spec-agent`.
4. Or add `architect-gate:rejected` to block downstream agents.

## Contract

`ArchitectReviewDecision@1.0` — saved as artifact and posted on approval.

## Skip rules

See `policies/routing-rules.yaml` → `architect_gate_skip` (e.g. low-risk chores without product spec).

## Configuration

```yaml
# .ai-platform/manifest.yaml
client_tier: standard  # enterprise | regulated enables gate
gates:
  architect_review_gate: false
knowledge_owners:
  architect: "@your-architect"
```

## Related

- `architecture-review-agent` — code/arch consistency before review-agent
