# Prompt Optimization Framework

After each quality-agent execution, runtime saves:

`.ai-platform/optimization/{issue_id}/{agent}-latest.json`

## Fields

| Field | Purpose |
|-------|---------|
| what_worked | Patterns to reinforce in prompts/skills |
| what_failed | Patterns to block |
| root_cause | Single primary failure category |
| recommended_improvements | Actionable prompt/skill edits |
| agent_score | Quantitative feedback |

## Root cause taxonomy
- `hallucination` — invented code not in context
- `scope_drift` — files outside plan
- `standards_violation` — self-review or review FAIL
- `contract_invalid` — JSON/schema
- `ac_gap` — acceptance criteria not met
- `architecture` — layer/dependency violation
- `insufficient_review_depth` — review-agent shallow

## Improvement loop (manual v1)
1. Review optimization JSON weekly
2. Patch `prompts/{agent}/` or `skills/`
3. Add golden example to `examples/`
4. Re-run same Issue on demo project — compare agent_score

## Future (self-improving platform)
- Auto-suggest prompt diff from N runs with score < 70
- Platform Architect approves prompt pack version bump
