/**
 * Cross-layer consistency check for agent definitions.
 *
 * The platform intentionally keeps several layers per agent:
 *   - cloud-agents/agents/*.agent.yaml   → canonical identity (system, model, tools, contract)
 *   - runtime/config/agents/*.runtime.yaml → pipeline orchestration (enabled, retry, next_agent)
 *   - runtime/src/agents/*.ts            → executable logic (validate/normalize output)
 *   - contracts/schemas/*.v1.json        → output contract schema
 *
 * This guardrail turns silent drift between those layers into a detectable error,
 * so `validate-agents` can run in CI.
 */
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getPlatformRoot } from "./config.js";
import { loadCloudAgentCatalog } from "./cloud-agent-catalog.js";
import { loadAgentDefinition } from "./agent-definition.js";
import { listAgentModules } from "./agents/index.js";

export interface AgentValidationReport {
  contract: "AgentValidationReport";
  version: "1.0";
  ok: boolean;
  errors: string[];
  warnings: string[];
  checked: {
    catalog_agents: number;
    registry_agents: number;
    runtime_defs: number;
    ts_modules: number;
  };
}

interface AgentRegistry {
  meta?: string[];
  sdlc?: string[];
  on_demand?: string[];
  total_agents?: number;
}

function loadAgentRegistry(platformRoot: string): { ids: string[]; declaredTotal?: number } {
  const p = path.join(platformRoot, "registries", "agent-registry.yaml");
  if (!fs.existsSync(p)) return { ids: [] };
  const raw = YAML.parse(fs.readFileSync(p, "utf8")) as AgentRegistry;
  const ids = [...(raw.meta ?? []), ...(raw.sdlc ?? []), ...(raw.on_demand ?? [])];
  return { ids, declaredTotal: raw.total_agents };
}

/** Does the agent have a production prompt pack? */
function hasPromptSource(platformRoot: string, agentId: string): boolean {
  return fs.existsSync(path.join(platformRoot, "prompts", agentId));
}

/** Contracts validated by code (code-guard / TS modules), not by a JSON schema file. */
const CODE_VALIDATED_CONTRACTS = new Set(["CodeChanges"]);

function stripVersion(contract: string | undefined): string | undefined {
  return contract?.replace(/@\d+\.\d+$/, "");
}

function readRuntimeDef(
  platformRoot: string,
  agentId: string
): { model?: string; output_contract?: string } | null {
  const p = path.join(
    platformRoot,
    "runtime/config/agents",
    `${agentId}.runtime.yaml`
  );
  if (!fs.existsSync(p)) return null;
  return YAML.parse(fs.readFileSync(p, "utf8")) as {
    model?: string;
    output_contract?: string;
  };
}

function contractSchemaExists(platformRoot: string, contract: string): boolean {
  const name = stripVersion(contract);
  if (!name) return false;
  const p = path.join(platformRoot, "contracts", "schemas", `${name}.v1.json`);
  return fs.existsSync(p);
}

export function validateAgents(platformRoot?: string): AgentValidationReport {
  const root = platformRoot ?? getPlatformRoot();
  const catalog = loadCloudAgentCatalog(root);
  const errors: string[] = [];
  const warnings: string[] = [];
  const tsModules = new Set(listAgentModules());

  let runtimeDefs = 0;
  const agentIds = Object.keys(catalog.agents);

  for (const agentId of agentIds) {
    const entry = catalog.agents[agentId];
    const isChannel = entry.tier === "channel";

    let def;
    try {
      def = loadAgentDefinition(agentId, root);
    } catch (err) {
      errors.push(
        `[${agentId}] catalog entry has no resolvable definition: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      continue;
    }

    if (def.metadata.agent_id !== agentId) {
      errors.push(
        `[${agentId}] metadata.agent_id is "${def.metadata.agent_id}" — must match catalog key`
      );
    }

    if (entry.sku && def.metadata.sku && entry.sku !== def.metadata.sku) {
      warnings.push(
        `[${agentId}] sku mismatch: catalog=${entry.sku} agent=${def.metadata.sku}`
      );
    }

    const defContract = stripVersion(def.metadata.output_contract);
    if (
      defContract &&
      !CODE_VALIDATED_CONTRACTS.has(defContract) &&
      !contractSchemaExists(root, defContract)
    ) {
      warnings.push(
        `[${agentId}] output_contract ${defContract} has no contracts/schemas/${defContract}.v1.json`
      );
    }

    const runtime = readRuntimeDef(root, agentId);
    if (runtime) {
      runtimeDefs += 1;
      const runtimeContract = stripVersion(runtime.output_contract);
      if (defContract && runtimeContract && defContract !== runtimeContract) {
        errors.push(
          `[${agentId}] output_contract drift: agent=${defContract} runtime=${runtimeContract}`
        );
      }
      if (
        runtime.model &&
        def.model &&
        runtime.model !== def.model &&
        runtime.model !== "deterministic"
      ) {
        warnings.push(
          `[${agentId}] model drift: agent=${def.model} runtime=${runtime.model}`
        );
      }
      if (defContract && !tsModules.has(agentId)) {
        warnings.push(
          `[${agentId}] has runtime def but no TS module (falls back to generic-agent)`
        );
      }
    } else if (!isChannel) {
      warnings.push(
        `[${agentId}] non-channel agent has no runtime/config/agents/${agentId}.runtime.yaml`
      );
    }
  }

  // --- Registry cross-checks (registries/agent-registry.yaml is the superset) ---
  const registry = loadAgentRegistry(root);
  const registrySet = new Set(registry.ids);

  if (registry.declaredTotal !== undefined && registry.declaredTotal !== registry.ids.length) {
    errors.push(
      `[registry] total_agents=${registry.declaredTotal} but ${registry.ids.length} agents listed`
    );
  }

  for (const agentId of agentIds) {
    const entry = catalog.agents[agentId];
    if (entry.tier !== "channel" && !registrySet.has(agentId)) {
      errors.push(
        `[${agentId}] in cloud catalog but missing from registries/agent-registry.yaml`
      );
    }
  }

  for (const agentId of registry.ids) {
    const hasRuntime =
      fs.existsSync(path.join(root, "runtime/config/agents", `${agentId}.runtime.yaml`));
    if (!hasRuntime && agentId !== "context-builder-agent") {
      warnings.push(`[${agentId}] in registry but has no runtime/config/agents def`);
    }
    if (!hasPromptSource(root, agentId)) {
      warnings.push(`[${agentId}] in registry but has no prompt pack in prompts/`);
    }
  }

  return {
    contract: "AgentValidationReport",
    version: "1.0",
    ok: errors.length === 0,
    errors,
    warnings,
    checked: {
      catalog_agents: agentIds.length,
      registry_agents: registry.ids.length,
      runtime_defs: runtimeDefs,
      ts_modules: tsModules.size,
    },
  };
}
