# Documentation

Documentation map for the **Agentic SDLC Platform** (Blueprint v2.1).

Start here, then follow the path that matches your role.

## By role

| I am… | Read in this order |
|-------|--------------------|
| **New user / operator** | [getting-started](guides/getting-started.md) → [secrets-and-setup](guides/secrets-and-setup.md) → [slack-setup](guides/slack-setup.md) → [project-onboarding](guides/project-onboarding.md) |
| **Developer (platform)** | [PLATFORM.md](PLATFORM.md) → [architecture handbook](handbooks/architecture-handbook.md) → [ADRs](architecture/) → [`runtime/`](../runtime/README.md) |
| **Architect / reviewer** | [architecture handbook](handbooks/architecture-handbook.md) → [architect-gate handbook](handbooks/architect-gate-handbook.md) → [ADR-0001](architecture/ADR-0001-agent-definition-layers.md) |
| **Agent author** | [agent handbook](handbooks/agent-handbook.md) → [`agents/`](../agents/README.md) → [`prompts/`](../prompts/README.md) → [`contracts/`](../contracts/README.md) |
| **Knowledge owner** | [knowledge-owners handbook](handbooks/knowledge-owners-handbook.md) → [`knowledge/`](../knowledge/README.md) |
| **Operations / on-call** | [operations handbook](handbooks/operations-handbook.md) → [troubleshooting](operations/troubleshooting.md) → [pipeline-trace](handbooks/pipeline-trace.md) |
| **Commercial / sales** | [cloud-agent-catalog](guides/cloud-agent-catalog.md) → [commercial-licensing](guides/commercial-licensing.md) |

## Structure

| Folder | Contents |
|--------|----------|
| [`architecture/`](architecture/) | Blueprint v2.1, ADRs, ADR template + process |
| [`guides/`](guides/) | Task-oriented how-tos (setup, onboarding, integrations, lifecycle) |
| [`handbooks/`](handbooks/) | Role handbooks (architecture, agents, governance, operations, …) |
| [`operations/`](operations/) | Runbooks and troubleshooting |
| [`PLATFORM.md`](PLATFORM.md) | High-level platform overview |

## Guides index

| Guide | Topic |
|-------|-------|
| [getting-started](guides/getting-started.md) | First run, end-to-end |
| [secrets-and-setup](guides/secrets-and-setup.md) | All secrets + Slack/GitHub bot setup |
| [slack-setup](guides/slack-setup.md) | **Slack end-to-end runbook** (per-agent) |
| [project-onboarding](guides/project-onboarding.md) | Onboard a client repo |
| [project-lifecycle](guides/project-lifecycle.md) | Pre-dev → development phases |
| [channel-integration](guides/channel-integration.md) | Slack/webhook/stdio + MCP |
| [claude-cloud-agents-integration](guides/claude-cloud-agents-integration.md) | Cloud Agents runtime |
| [claude-code-integration](guides/claude-code-integration.md) | Claude Code runtime |
| [cloud-agent-catalog](guides/cloud-agent-catalog.md) | Sellable agent catalog |
| [commercial-licensing](guides/commercial-licensing.md) | Licensing & tiers |
| [app-templates](guides/app-templates.md) | Scaffold templates |
| [multi-repo-workflows](guides/multi-repo-workflows.md) | Multi-repo orchestration |
| [architecture-conversation](guides/architecture-conversation.md) | Architect conversation flow |
| [platform-upgrade](guides/platform-upgrade.md) | Upgrading the platform |
| [dev-bridge](guides/dev-bridge.md) | Local dev bridge |

## Directory references (code-adjacent READMEs)

Each top-level folder has its own README describing contents and conventions:

[`agents/`](../agents/README.md) ·
[`cloud-agents/`](../cloud-agents/README.md) ·
[`contracts/`](../contracts/README.md) ·
[`context/`](../context/README.md) ·
[`frameworks/`](../frameworks/README.md) ·
[`governance/`](../governance/README.md) ·
[`knowledge/`](../knowledge/README.md) ·
[`policies/`](../policies/README.md) ·
[`prompts/`](../prompts/README.md) ·
[`registries/`](../registries/README.md) ·
[`runtime/`](../runtime/README.md) ·
[`skills/`](../skills/README.md) ·
[`standards/`](../standards/README.md) ·
[`templates/`](../templates/README.md) ·
[`.github/workflows/`](../.github/workflows/README.md) ·
[`examples/`](../examples/README.md) ·
[`evaluation/`](../evaluation/README.md)

## Conventions

- **Markdown** for human docs, **YAML/JSON** for machine-read config and contracts.
- Architectural changes that diverge from the Blueprint require an [ADR](architecture/README.md).
- Keep guides task-oriented ("how do I…"); keep handbooks role-oriented ("as an X, I need to know…").
