# ADR-0003: GitHub Actions as the orchestration substrate

**Status:** Accepted (retroactive)  
**Date:** 2026-06-09  
**Change / PR:** Documentation of foundational design

## Context

The SDLC pipeline must trigger on repository events (issues, PRs, labels), run
agents, enforce gates, and write results back to GitHub — for many client repos.

## Decision

Use **GitHub Actions** as the orchestration runtime:

- Reusable workflows in `.github/workflows/` (`workflow_call`) implement routing,
  dispatch, context build, gates (architecture/review/qa/security), and release.
- The Node CLI (`runtime/`) is the unit of work invoked by jobs.
- Client repos receive the workflows they need at onboarding
  (`templates/project-repo/.github`).
- The manifest marks `orchestrator_ready: true` so a standalone orchestrator can
  replace Actions later without changing agent/contract layers.

## Consequences

### Positive

- Native to where the code lives; no extra infra to operate initially.
- Per-repo isolation, secrets, and audit via GitHub.
- Reusable workflows keep client repos thin.

### Negative / trade-offs

- Actions runtime limits (timeouts, concurrency) constrain long agents.
- Vendor coupling — mitigated by the contract/CLI seam and `orchestrator_ready`.

## Alternatives considered

1. **Standalone orchestrator service** — deferred; revisit at scale (see trigger
   list in [architecture/README](README.md)).
2. **Cron/poller** — rejected: event-driven is simpler and timelier.

## References

- [`.github/workflows/`](../../.github/workflows/README.md)
- `manifest.platform.yaml` (`orchestrator_ready`)
- [Operations handbook](../handbooks/operations-handbook.md)
