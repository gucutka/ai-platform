# Claude Code Integration Guide

## When to Use

Workflow Agent sets `runtime: claude-code` for:

- Complexity L/XL
- `area: unknown`
- Implement retry failures (×2)
- `manifest.agent_routing.complex_refactor: claude-code`

## Session Flow

1. Set `IMPLEMENT_RUNTIME=claude-code` **or** `manifest.agent_routing.complex_refactor: claude-code` with complexity L/XL.
2. Pipeline stops at **implement** with `ClaudeCodeSession` artifact + issue comment.
3. Human opens Claude Code with ContextPack (see session comment).
4. Submit CodeChanges via bridge:
   ```bash
   node dist/cli.js submit-code-changes --issue N --agent backend-implement-agent --file changes.json
   node dist/cli.js resume --issue N --from qa-gate --project-dir /path/to/project
   ```
5. On completion, platform continues QA → PR → review.

## Env switch

| Variable | Values | Effect |
|----------|--------|--------|
| `IMPLEMENT_RUNTIME` | `cloud-agent` (default) | Cloud dispatch via Anthropic API |
| `IMPLEMENT_RUNTIME` | `claude-code` | Session manifest; pipeline waits |

Force cloud: `IMPLEMENT_RUNTIME=cloud-agent`

## Legacy flow

1. Platform dispatches implement-agent with `runtime: claude-code`.
2. Orchestrator issues **session manifest** (signed URL, TTL 4h).
3. Human executor (Tech Lead / assigned dev) opens Claude Code with manifest.
4. ContextPack ref pre-loaded — no manual copy-paste.
5. On completion, submit `ImplementationResult@1.0` via platform bridge webhook.

## Constraints

- Branch prefix from `ImplementationPlan.branch_name`
- `allowed_paths` from project manifest
- Completion required before state transition

## Reference

Blueprint v2.1 — Claude Integration Architecture
