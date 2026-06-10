# Routing — docs-agent

- **Dispatched by:** workflow-agent, issue-routing.yml
- **Preconditions:** MergeRecord
- **Post:** contract-validate → optional contract-validator-agent → handoff-summarizer
- **Policies:** policies/routing-rules.yaml
