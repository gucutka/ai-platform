# Documentation Standards

## Code
- JSDoc on exported public APIs when repo uses it
- No redundant comments on obvious code

## User docs
- Update README when new public endpoints added
- OpenAPI sync if `openapi` skill applies

## Agent output
- PR body links Issue (`Closes #N`) with **Summary**, **Changes**, **How to test**, optional **Notes**
- Implement agents set `CodeChanges.pr_description`; runtime formats the GitHub PR body
- Contract comments use `ai-platform-contract` fence
