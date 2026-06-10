# examples/

**Gold-standard and anti-pattern outputs** used as few-shot references and as
fixtures for evaluation. They show agents what "good" and "bad" look like.

## Layout

| Path | Purpose |
|------|---------|
| `backend-implement-agent/` | `good-example.md`, `bad-example.md` |
| `frontend-implement-agent/` | `good-example.md`, `bad-example.md` |
| `qa-agent/excellent-output.json` | Exemplar QA contract output |
| `review-agent/excellent-output.json` | Exemplar review (PASS) |
| `review-agent/failure-output.json` | Exemplar review (FAIL) |

## Usage

- **Few-shot**: referenced by prompt packs / execution prompts to anchor quality.
- **Evaluation**: consumed as fixtures by [`evaluation/`](../evaluation/README.md).

## Conventions

- JSON examples must validate against the agent's output contract in
  [`contracts/schemas/`](../contracts/README.md).
- Pair a `good`/`excellent` example with a `bad`/`failure` one where useful.

## Related

- [`prompts/`](../prompts/README.md) · [`evaluation/`](../evaluation/README.md)
