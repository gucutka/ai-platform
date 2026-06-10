---
name: github-integration
description: Issues, PRs, labels, comments, workflow conventions.
production_grade: true
---

# GitHub integration

## Purpose
Issues, PRs, labels, comments, workflow conventions.

## When To Use
All agents posting to GitHub

## When Not To Use
Non-GitHub systems

## Architecture Rules
Use ai-platform-contract fence in comments

## Coding Rules
Link Issue in PR body (`Closes #N`); use labels from templates/labels.json

Implement agents emit `CodeChanges.pr_description` with markdown sections:
- **Summary** — one sentence
- **Changes** — bullet list
- **How to test** — verification steps
- **Notes** — optional risks / follow-ups

Runtime formats the GitHub PR body via `formatPullRequestBody`.

## Patterns
Post contracts as JSON comments

## Anti Patterns
Edit issues without structured contract

## Examples
Label agent-route:pending on intake

## Edge Cases
Wrong repo context

## Testing Expectations
N/A

## Review Criteria
Fence tag present

## Escalation Rules
Permission errors → escalate
