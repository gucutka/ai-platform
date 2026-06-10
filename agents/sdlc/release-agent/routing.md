# Routing — release-agent

- **Dispatched by:** workflow-agent, issue-routing.yml
- **Preconditions:** DocumentationResult
- **Post:** contract-validate → optional contract-validator-agent → handoff-summarizer
- **Policies:** policies/routing-rules.yaml
