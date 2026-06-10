# AI Platform

Production-ready **Agentic SDLC Platform** control plane (Blueprint v2.1).

## Purpose

Orchestrate software delivery for outsourcing project repositories via:

- Claude Code & Claude Cloud Agents (Claude `.agent.yaml` format + MCP)
- GitHub Issues, Projects, Actions, Pull Requests
- Conversational pre-development over Slack / webhook / stdio channels

## Two ways agents run

| Mode | Entry | Agents |
|------|-------|--------|
| **Pipeline** (Issue → PR) | `run-pipeline` + reusable workflows | triage → workflow → specs → plan → implement → QA/CI → review → security → merge → docs/release |
| **Conversation** (chat → knowledge / Issue) | channel adapters + Slack MCP | project intake, requirements (BA), architecture, feature intake |

Both share the catalog, licensing, contracts, and cost/audit governance.

## Repository Layout

| Path | Purpose |
|------|---------|
| [`cloud-agents/agents/`](cloud-agents/agents/) | **Canonical agent definitions** (`.agent.yaml`, Claude format) |
| `cloud-agents/catalog.yaml` | SKUs, packages, licensing (15 sellable) |
| [`agents/`](agents/README.md) | Agent specs + prompts (registry: 20 agents) |
| [`skills/`](skills/README.md) | Production skills |
| `runtime/` | Node.js dispatcher, channel orchestrator, CLI |
| `runtime/config/agents/` | Pipeline runtime orchestration defs |
| `runtime/src/agents/` | Executable agent modules (validate/normalize) |
| `prompts/` | Production prompt packs (layered) |
| `contracts/` | JSON schemas, validation, versioning |
| `knowledge/` | Layer templates and governance |
| `.github/workflows/` | Platform + reusable workflows |
| `templates/` | App scaffolds + client onboarding |
| `docs/` | Handbooks, guides, ADRs |

See [ADR-0001](docs/architecture/ADR-0001-agent-definition-layers.md) for how the
agent definition layers relate.

## Quick Start

1. Install Node.js **20+**, run `cd runtime && npm install && npm run build`.
2. Copy secrets: `cp runtime/.env.example runtime/.env` and fill keys
   (see [secrets-and-setup.md](docs/guides/secrets-and-setup.md)).
3. Onboard a client repo with `.ai-platform/manifest.yaml`
   (see [project-onboarding.md](docs/guides/project-onboarding.md)).
4. First run: [getting-started.md](docs/guides/getting-started.md).

## Health checks

```bash
node dist/cli.js validate-agents          # cross-layer consistency guardrail
node dist/cli.js list-agent-definitions   # all canonical agents
node dist/cli.js list-cloud-agents --sellable true
```

## Platform Version

**2.1.0** — see `manifest.platform.yaml` and `governance/platform-compatibility-matrix.yaml`.

## Documentation

- [Platform overview](docs/PLATFORM.md)
- [Getting started](docs/guides/getting-started.md)
- [Secrets & setup](docs/guides/secrets-and-setup.md)
- [Cloud agent catalog](docs/guides/cloud-agent-catalog.md)
- [Channel integration](docs/guides/channel-integration.md)
- [Architecture Handbook](docs/handbooks/architecture-handbook.md)
- [Agent Handbook](docs/handbooks/agent-handbook.md)
- [ADR-0001: Agent definition layers](docs/architecture/ADR-0001-agent-definition-layers.md)

## License

Proprietary — internal outsourcing platform.
