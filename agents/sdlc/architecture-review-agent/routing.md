# Routing — architecture-review-agent

- **Dispatched by:** workflow-agent, issue-routing.yml
- **Preconditions:** ImplementationResult, TechnicalDesign
- **Post:** contract-validate → optional contract-validator-agent → handoff-summarizer
- **Policies:** policies/routing-rules.yaml
