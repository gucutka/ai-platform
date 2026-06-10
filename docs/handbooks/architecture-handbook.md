# Architecture Handbook

## Blueprint

**v2.1** — see `docs/architecture/blueprint-v2.1.md` (summary in repo README).

## Core Principles

1. Control plane (ai-platform) / data plane (project repos)
2. GitHub as System of Record
3. Knowledge Owners ≠ Agents
4. Context Builder centralizes retrieval
5. Thin agents + dynamic skills + ContextPack v1

## Layers

| Layer | Path |
|-------|------|
| Agents | `agents/` |
| Skills | `skills/` |
| Contracts | `contracts/` |
| Knowledge reference | `knowledge/` |
| Context | `context/` |
| Policies | `policies/` |
| Governance | `governance/` |

## SDLC Highlights v2.1

- Architect Review Gate (after product-spec-agent)
- architecture-review-agent (before review-agent)
- Stack implement agents (frontend/backend/fullstack/infra)
