# Agent Handbook

## Registry

`registries/agent-registry.yaml` — **20 agents** (4 meta + 16 SDLC).

## Per-Agent Files

```
agents/{meta|sdlc|on-demand}/{agent-id}/
  agent.yaml      # Agent Contract Model
  agent.md        # Human-readable spec
  contract.yaml   # Output contract binding
  prompt.md       # System prompt
  routing.md      # Dispatch rules
```

## Meta Agents

| Agent | Role |
|-------|------|
| workflow-agent | SDLC path and risk |
| context-builder-agent | ContextPack v1 |
| contract-validator-agent | Semantic validation |
| handoff-summarizer-agent | Inter-stage compression |

## Invariants

- SDLC agents: `no_direct_retrieval: true`
- Output: JSON in `ai-platform-contract` fence
- Retry: 3× then escalate to Tech Lead
