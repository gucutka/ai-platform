export interface Manifest {
  platform_version: string;
  project_id: string;
  runtime_profile?: string;
  allowed_paths?: string[];
  infra_allowed_paths?: string[];
  agent_routing?: {
    default?: string;
    complex_refactor?: string;
  };
  ci?: {
    install?: string;
    test?: string;
  };
  token_budget?: { per_issue_max?: number; monthly_usd?: number };
  client_tier?: string;
  app_template?: string;
  lifecycle_enabled?: boolean;
  purchased_agents?: string[];
  knowledge_owners?: {
    architect?: string;
    business_analyst?: string;
    product_analyst?: string;
  };
  knowledge_scopes?: string[];
  knowledge_enforcement?: boolean;
  knowledge_require_approval?: boolean;
  gates?: {
    require_human_review?: boolean;
    require_security_scan?: boolean;
    architect_review_gate?: boolean;
    architecture_review_agent?: boolean;
    automerge_on_ci_pass?: boolean;
    automerge_requires_review_pass?: boolean;
  };
  automerge?: {
    enabled?: boolean;
    method?: "merge" | "squash" | "rebase";
    only_ai_prs?: boolean;
  };
}

export interface RuntimeAgentDef {
  agent_id: string;
  enabled: boolean;
  model: string;
  max_tokens: number;
  input_contracts: string[];
  output_contract: string;
  required_context: string[];
  skills?: { core?: string[]; sdlc?: string[]; technology?: string[] };
  retry: { max_attempts: number; backoff_ms: number[] };
  failure_handling: Record<string, string>;
  next_agent?: string;
  next_workflow?: string;
  verdict_values?: string[];
}

export interface ContextPackRef {
  path: string;
  sha256: string;
  kind: "code" | "knowledge" | "pr_diff";
}

export interface ContextPack {
  contract: "ContextPack";
  version: "1.0";
  dispatch_id: string;
  target_agent: string;
  tier: "T0" | "T1" | "T2" | "T3";
  issue: IssueContext;
  manifest: Manifest;
  contracts: Record<string, unknown>;
  files: FileSnippet[];
  skills_text: string;
  refs?: ContextPackRef[];
  context_pack_hash?: string;
  token_budget?: {
    tier_limit_tokens: number;
    estimated_prompt_tokens: number;
  };
  sections?: Record<string, unknown>;
  knowledge_index_hash?: string;
  freshness?: {
    built_at: string;
    stage: string;
    cache_key: string;
    ttl_seconds?: number;
  };
}

export interface IssueContext {
  number: number;
  title: string;
  body: string;
  labels: string[];
}

export interface FileSnippet {
  path: string;
  content: string;
}

export interface PrDescription {
  summary: string;
  changes: string;
  testing: string;
  notes?: string;
}

export interface CodeChanges {
  contract: "CodeChanges";
  version: "1.0";
  issue_id: number;
  branch: string;
  files: { path: string; content: string }[];
  summary?: string;
  pr_description?: PrDescription;
  agent_run_id?: string;
}

export interface PipelineState {
  issueNumber: number;
  triage?: Record<string, unknown>;
  plan?: Record<string, unknown>;
  codeChanges?: CodeChanges;
  prNumber?: number;
}
