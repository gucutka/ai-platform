## Summary

<!-- Link Issue: Closes # -->

## Agentic SDLC gates (label sync)

| Gate | Required label | Current |
|------|----------------|---------|
| Architecture Review | `arch-review:passed` | `arch-review:` |
| Code Review | `agent:review-passed` | |
| Security scan | `security-scan:passed` | |
| CI / Verification | `ci:passed` | |
| Human review | `human-review:approved` | |
| Ready to merge | `agent-route:ready-to-merge` | |

Project board fields (**Agent Route**, **Risk**, **Status**, **Blocked**) sync from labels via **Sync Project Fields** workflow.

## Spec Compliance

- [ ] Product Spec (PA approved)
- [ ] Technical Design (Architect approved)
- [ ] ADR references listed

## Human Review

- [ ] `human-review:required` → `human-review:approved` (Tech Lead)

## Checklist

- [ ] CI green (`ci:passed` on linked issue)
- [ ] No secrets in diff
- [ ] Token budget within manifest limits
