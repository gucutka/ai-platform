# Platform Upgrade Guide

## Versioning

- Platform: `manifest.platform.yaml` → `2.1.0`
- Contracts: semver in `contracts/versioning-rules.yaml`
- Projects pin `platform_version` in `.ai-platform/manifest.yaml`

## Rollout

1. Platform Architect publishes compatibility matrix update.
2. Platform Owner approves rollout window.
3. Projects update `platform_version` after validation.
4. Block dispatch on mismatch (orchestrator enforced).

## Breaking Changes

Require Platform ADR and 90-day deprecation notice per versioning rules.
