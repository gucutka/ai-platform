# Application Templates

Starter app skeletons combined with ai-platform onboarding.

## Catalog

```bash
node dist/cli.js list-app-templates
```

| Template | Stack |
|----------|--------|
| `express-api` | Node.js Express REST API |
| `nextjs-minimal` | Next.js 14 App Router |

## Scaffold new client project

```bash
node dist/cli.js scaffold-app \
  --target /tmp/my-client \
  --template express-api \
  --project-id my-client \
  --tier standard
```

This:

1. Copies app skeleton from `templates/apps/{template}/skeleton/`
2. Seeds `docs/knowledge/` from template knowledge files
3. Runs `onboard-project` (workflows, manifest, lifecycle)
4. Sets `app_template` in manifest

## Customize

Add templates under `templates/apps/`:

```
templates/apps/my-template/
├── catalog entry in catalog.yaml
├── skeleton/          # app source
└── knowledge/         # optional seed docs
```
