# Failure Handling — backend-implement-agent

## Stop and escalate when
- Plan references non-existent files not marked as `create`
- ADR required but not in Technical Layer context
- Ambiguous AC (two interpretations)
- Need new dependency not in plan

## Retry internally when
- Contract validation failed — fix JSON only
- Self-review FAIL — fix code, max 2 internal loops

## Never
- Guess API shapes from memory
- Copy code from external libraries not in repo
- Disable tests to pass

## Labels
On escalate: recommend `agent-route:blocked`
