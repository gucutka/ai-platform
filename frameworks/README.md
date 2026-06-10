# frameworks/

**Excellence frameworks** — opinionated rubrics layered into specific agents to
raise output quality beyond the baseline standards.

## Layout

| File | Applied to |
|------|-----------|
| `review-excellence.md` | review-agent |
| `qa-excellence.md` | qa-agent |

## Frameworks vs standards

| | [`standards/`](../standards/README.md) | `frameworks/` |
|-|-----------|------------|
| Nature | Normative rules (MUST/SHOULD) | Rubrics / mental models for excellence |
| Scope | Broad (code, tests, docs) | Targeted (review, QA) |
| Loaded by | `loadStandardsForAgent` | `loadStandardsForAgent` (agent-specific) |

## Related

- [`prompts/`](../prompts/README.md)
- [Agent handbook](../docs/handbooks/agent-handbook.md)
