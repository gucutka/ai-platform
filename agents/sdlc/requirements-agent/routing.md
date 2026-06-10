# Routing — requirements-agent

- **Dispatched by:** workflow-agent, issue-routing.yml
- **Preconditions:** WorkflowDecision
- **Post:** contract-validate → optional contract-validator-agent → handoff-summarizer
- **Policies:** policies/routing-rules.yaml
