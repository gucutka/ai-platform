# prompts/

**Production prompt packs** — the layered, granular prompt content for pipeline
agents. These are *layered enrichment* on top of the canonical identity in
[`cloud-agents/agents/*.agent.yaml`](../cloud-agents/README.md), not a competing
source of truth. See [ADR-0001](../docs/architecture/ADR-0001-agent-definition-layers.md).

## Pack structure

```
prompts/{agent-id}/
  system-prompt.md       # base role/system content
  execution-prompt.md    # step-by-step execution guidance
  review-checklist.md    # what to check before emitting output
  self-review.md         # self-critique pass (quality agents)
  failure-handling.md    # what to do on failure / ambiguity
```

Not every agent has every file; `prompt-loader.ts` includes whatever exists.

## Assembly

`runtime/src/prompt-loader.ts` builds the final prompt:

```
system-prompt  +  standards (per agent)  +  execution  +  review-checklist  +  failure-handling
                  └─ from standards/ + frameworks/
```

Quality agents (`QUALITY_AGENTS`) additionally run `self-review.md`.

| Folder | Notes |
|--------|-------|
| `optimization/framework.md` | Prompt-optimization loop guidance |

## Conventions

- Keep packs **modular** — one concern per file.
- Base identity (model, tools, contract) belongs in `.agent.yaml`, **not** here.
- After editing, run `node dist/cli.js validate-agents`.

## Related

- [`standards/`](../standards/README.md) · [`frameworks/`](../frameworks/README.md) · [`examples/`](../examples/README.md)
- [Agent handbook](../docs/handbooks/agent-handbook.md)
