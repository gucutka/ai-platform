# standards/

Engineering **standards** injected into agent prompts so generated code and reviews
are consistent. The prompt loader (`runtime/src/prompt-loader.ts`) selects relevant
standards per agent (e.g. backend agents get backend + testing standards).

## Layout

| File | Applied to |
|------|-----------|
| `backend-standards.md` | backend / fullstack implement |
| `frontend-standards.md` | frontend / fullstack implement |
| `testing-standards.md` | implement + qa |
| `review-standards.md` | review / security / docs / release |
| `architectural-consistency-rules.md` | review / architecture-review / infra |
| `documentation-standards.md` | docs |

## Conventions

- Standards are **normative** ("MUST/SHOULD"); keep them concise and checkable.
- A standard referenced by an agent must exist here, or `loadStandardsForAgent`
  silently skips it — keep filenames in sync with `prompt-loader.ts`.

## Related

- [`prompts/`](../prompts/README.md) — how standards are layered into prompts
- [`frameworks/`](../frameworks/README.md) — excellence frameworks for review/QA
