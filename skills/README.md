# Skills Directory

All skills use **production_grade: true** (v2.0) with full sections:

Purpose · When To Use · When Not To Use · Architecture Rules · Coding Rules · Patterns · Anti Patterns · Examples · Edge Cases · Testing · Review · Escalation

## Layout

```
skills/
├── core/           # 5 skills
├── sdlc/           # 10 skills
├── technology/
│   ├── frontend/   # react, nextjs, storybook
│   ├── backend/    # nestjs, fastapi, node-typescript
│   ├── infrastructure/
│   ├── database/
│   ├── testing/
│   └── documentation/
└── project/        # per-client registry
```

Each skill folder:
- `skill.md` — main content
- `skill.yaml` — metadata
- `examples/good-example.md`, `examples/bad-example.md`
- `validation/rules.yaml`

Registry: `registries/skill-registry.yaml`
