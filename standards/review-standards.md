# Review Standards

## Finding format
```json
{
  "severity": "critical|major|minor|info",
  "file": "src/server.js",
  "line": 42,
  "message": "Missing validation on req.params.id",
  "category": "correctness|security|architecture|style|performance"
}
```

## Severity guide
- **critical** — security, data loss, broken AC
- **major** — logic bug, missing error handling
- **minor** — maintainability
- **info** — optional suggestion (never alone causes FAIL)

## Verdict
FAIL = any critical/major OR AC miss OR architecture violation
