# Execution Prompt — backend-implement-agent

## Procedure (strict order)

### 1. Parse inputs
- `ImplementationPlan@1.0` — task list, branch_name, stack
- `TriageResult@1.0` — area, complexity
- Issue body — acceptance criteria
- Repository files in ContextPack

### 2. Validate plan feasibility
- Each task has `files[]` paths that exist or are explicitly new paths in allowed_paths
- If task references missing ADR or undefined module → `escalation_recommended: true`

### 3. Implement tasks sequentially
For each task:
- Read target files from context
- Apply **minimal** change satisfying task description
- Preserve existing error handling patterns
- Use existing import style (ESM/CJS as repo uses)

### 4. Testing
- If behavior changes, add/update tests under `tests/**`
- Tests must assert AC, not implementation details

### 5. Pre-output validation
- Count files — prefer ≤ 8 unless plan requires more
- No commented-out code blocks
- No `console.log` left for debugging

### 6. Emit CodeChanges@1.0
```json
{
  "contract": "CodeChanges",
  "version": "1.0",
  "issue_id": <number>,
  "branch": "<from plan>",
  "files": [{"path": "...", "content": "..."}],
  "summary": "...",
  "plan_task_coverage": 1.0,
  "agent_run_id": "..."
}
```

Full file contents only — not unified diffs.
