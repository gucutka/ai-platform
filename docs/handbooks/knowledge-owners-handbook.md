# Knowledge Owners Handbook

Knowledge Owners (KO) curate canonical docs under `docs/knowledge/{business,product,technical}/`. Agents may **read** approved knowledge and must **not** write to these paths.

## Roles

| Owner | Layer | Path | Gate label |
|-------|-------|------|------------|
| Business Analyst | business | `docs/knowledge/business/` | `knowledge:business-approved` |
| Product Analyst | product | `docs/knowledge/product/` | `knowledge:product-approved` |
| Architect | technical | `docs/knowledge/technical/` | `knowledge:technical-approved` |

Configure handles in `manifest.yaml` → `knowledge_owners`.

## Approval model

1. **Layer approval** — `.ai-platform/knowledge/approvals.yaml`:
   ```yaml
   version: "1.0"
   layers:
     business: approved
     product: draft
     technical: approved
   ```
2. **Per-file frontmatter** — in any knowledge doc:
   ```yaml
   ---
   status: approved
   ---
   ```
3. **Issue/PR labels** — apply `knowledge:product-approved` when a contract is signed off (see `knowledge/governance/approval-flows.yaml`).
4. **Explicit paths** — `approved_paths:` list in `approvals.yaml`.

Draft (unapproved) files are **not** injected into ContextPack when `knowledge_require_approval: true`.

## Workflows

| Workflow | Purpose |
|----------|-----------|
| `knowledge-sync.yml` | Rebuild `.ai-platform/knowledge/index.json` + hash on push to `docs/knowledge/**` |
| `knowledge-approve.yml` | KO manual gate — set layer status and commit index |

## CLI

```bash
node dist/cli.js knowledge-sync --project-dir /path/to/project
node dist/cli.js knowledge-approve --layer product --status approved --project-dir /path/to/project
```

## Agent write guard

`code-guard` blocks any `CodeChanges` touching `docs/knowledge/**`. Agents draft in issue comments or PR descriptions; KO promotes to canonical paths.

## Contract gate labels

After agent output is reviewed:

- `requirements-agent` → BA adds `knowledge:business-approved`
- `product-spec-agent` → PA adds `knowledge:product-approved`
- `technical-spec-agent` → Architect adds `knowledge:technical-approved`

These labels also unlock layer injection for that pipeline issue when layer approval file is still `draft`.

## Manifest flags

| Field | Default | Meaning |
|-------|---------|---------|
| `knowledge_scopes` | all layers | Which layers agents may retrieve |
| `knowledge_enforcement` | `true` | Use index + approval rules |
| `knowledge_require_approval` | `true` | Exclude draft docs from ContextPack |

Set `knowledge_require_approval: false` only for local demos without KO process.
