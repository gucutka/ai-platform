import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getPlatformRoot } from "./config.js";
import type { Manifest } from "./types.js";

export type ClientTier = "standard" | "enterprise" | "regulated";

export interface TierPreset {
  description?: string;
  token_budget?: { monthly_usd?: number; per_issue_max?: number };
  gates?: Manifest["gates"];
  knowledge_enforcement?: boolean;
  knowledge_require_approval?: boolean;
  workflow?: {
    path_bias?: "low_risk" | "medium_feature" | "high_risk";
    force_spec_chain?: boolean;
    require_security_agent?: boolean;
    max_concurrent_agents?: number;
  };
  automerge?: Manifest["automerge"];
}

export interface TierPresetsFile {
  version: string;
  tiers: Record<ClientTier, TierPreset>;
}

let cached: TierPresetsFile | null = null;

export function loadTierPresets(): TierPresetsFile {
  if (cached) return cached;
  const file = path.join(getPlatformRoot(), "templates", "tier-presets.yaml");
  if (!fs.existsSync(file)) {
    cached = { version: "1.0", tiers: {} as Record<ClientTier, TierPreset> };
    return cached;
  }
  cached = YAML.parse(fs.readFileSync(file, "utf8")) as TierPresetsFile;
  return cached;
}

export function normalizeClientTier(raw?: string): ClientTier {
  const t = String(raw ?? "standard").toLowerCase();
  if (t === "enterprise" || t === "regulated") return t;
  return "standard";
}

export function applyTierPreset(manifest: Manifest): Manifest {
  const tier = normalizeClientTier(manifest.client_tier);
  const presets = loadTierPresets();
  const preset = presets.tiers[tier];
  if (!preset) return { ...manifest, client_tier: tier };

  return {
    ...manifest,
    client_tier: tier,
    token_budget: {
      ...preset.token_budget,
      ...manifest.token_budget,
    },
    gates: {
      ...preset.gates,
      ...manifest.gates,
    },
    automerge: {
      ...preset.automerge,
      ...manifest.automerge,
    },
    knowledge_enforcement:
      manifest.knowledge_enforcement ?? preset.knowledge_enforcement,
    knowledge_require_approval:
      manifest.knowledge_require_approval ?? preset.knowledge_require_approval,
  };
}

export function tierWorkflowBias(manifest: Manifest): TierPreset["workflow"] | undefined {
  const tier = normalizeClientTier(manifest.client_tier);
  return loadTierPresets().tiers[tier]?.workflow;
}

export function applyTierToWorkflowDecision(
  manifest: Manifest,
  decision: { risk_level: string; skip_stages: string[]; human_gates: string[]; mandatory_agents: string[] }
): typeof decision {
  const wf = tierWorkflowBias(manifest);
  if (!wf) return decision;

  const out = { ...decision, skip_stages: [...decision.skip_stages], human_gates: [...decision.human_gates], mandatory_agents: [...decision.mandatory_agents] };

  if (wf.force_spec_chain) {
    out.skip_stages = out.skip_stages.filter(
      (s) => !["discovery", "design", "requirements"].includes(s.toLowerCase())
    );
  }

  if (wf.require_security_agent && !out.mandatory_agents.includes("security-agent")) {
    out.mandatory_agents.push("security-agent");
  }

  if (manifest.client_tier === "regulated") {
    if (!out.human_gates.includes("human-review:required")) {
      out.human_gates.push("human-review:required");
    }
  }

  if (wf.path_bias === "high_risk" && out.risk_level === "low") {
    out.risk_level = "medium";
  }

  return out;
}
