import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { loadAgentDefinition, agentDefinitionToLegacyManifest } from "./agent-definition.js";
import { getPlatformRoot } from "./config.js";

export interface CloudAgentCatalogEntry {
  sku: string;
  sellable: boolean;
  tier?: string;
  channel_modes?: string[];
  /** @deprecated use agent */
  manifest?: string;
  /** Claude Console–style agent definition path relative to cloud-agents/ */
  agent?: string;
}

export interface CloudAgentPackage {
  label: string;
  agents: string[];
}

export interface CloudAgentCatalog {
  version: string;
  platform_version: string;
  defaults: {
    model: string;
    runtime: string;
    max_concurrent: Record<string, number>;
  };
  agents: Record<string, CloudAgentCatalogEntry>;
  packages?: Record<string, CloudAgentPackage>;
}

export interface CloudAgentManifest {
  agent_id: string;
  cloud_agent_name: string;
  cloud_agent_id?: string;
  sku: string;
  sellable: boolean;
  model: string;
  max_tokens: number;
  output_contract?: string;
  description?: string;
  prompt_source?: string;
  system_prompt?: string;
}

export interface CloudAgentDeploymentRecord {
  agent_id: string;
  cloud_agent_name: string;
  cloud_agent_id?: string;
  sku: string;
  status: "pending" | "provisioned" | "local";
  updated_at: string;
}

export function cloudAgentsRoot(platformRoot?: string): string {
  return path.join(platformRoot ?? getPlatformRoot(), "cloud-agents");
}

export function loadCloudAgentCatalog(platformRoot?: string): CloudAgentCatalog {
  const file = path.join(cloudAgentsRoot(platformRoot), "catalog.yaml");
  if (!fs.existsSync(file)) {
    throw new Error(`Cloud agent catalog not found: ${file}`);
  }
  return YAML.parse(fs.readFileSync(file, "utf8")) as CloudAgentCatalog;
}

export function loadCloudAgentManifest(
  agentId: string,
  platformRoot?: string
): CloudAgentManifest {
  try {
    const def = loadAgentDefinition(agentId, platformRoot);
    return agentDefinitionToLegacyManifest(def) as CloudAgentManifest;
  } catch {
    /* fall through to legacy manifest file */
  }

  const root = cloudAgentsRoot(platformRoot);
  const catalog = loadCloudAgentCatalog(root);
  const entry = catalog.agents[agentId];
  if (!entry) {
    throw new Error(`Agent not in cloud catalog: ${agentId}`);
  }
  const manifestPath = entry.manifest ?
    path.join(root, entry.manifest)
  : path.join(root, "manifests", `${agentId}.yaml`);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Cloud agent manifest not found: ${manifestPath}`);
  }
  return YAML.parse(fs.readFileSync(manifestPath, "utf8")) as CloudAgentManifest;
}

export function listSellableAgents(platformRoot?: string): CloudAgentManifest[] {
  const catalog = loadCloudAgentCatalog(platformRoot);
  return Object.keys(catalog.agents)
    .filter((id) => catalog.agents[id]?.sellable)
    .map((id) => loadCloudAgentManifest(id, platformRoot));
}

export function isAgentLicensed(
  agentId: string,
  purchasedAgents: string[] | undefined,
  platformRoot?: string
): boolean {
  if (!purchasedAgents?.length) return true;
  const catalog = loadCloudAgentCatalog(platformRoot);
  if (purchasedAgents.includes(agentId)) return true;
  for (const pkg of purchasedAgents) {
    const pack = catalog.packages?.[pkg];
    if (pack?.agents.includes(agentId)) return true;
  }
  return false;
}

export function loadDeployments(platformRoot?: string): CloudAgentDeploymentRecord[] {
  const file = path.join(cloudAgentsRoot(platformRoot), "deployments.local.yaml");
  if (!fs.existsSync(file)) return [];
  const raw = YAML.parse(fs.readFileSync(file, "utf8")) as {
    deployments?: CloudAgentDeploymentRecord[];
  };
  return raw.deployments ?? [];
}

export function saveDeployments(
  deployments: CloudAgentDeploymentRecord[],
  platformRoot?: string
): string {
  const file = path.join(cloudAgentsRoot(platformRoot), "deployments.local.yaml");
  fs.writeFileSync(
    file,
    YAML.stringify({ version: "1.0", updated_at: new Date().toISOString(), deployments })
  );
  return file;
}

export function resolveCloudAgentId(
  agentId: string,
  platformRoot?: string
): string | undefined {
  const manifest = loadCloudAgentManifest(agentId, platformRoot);
  if (manifest.cloud_agent_id) return manifest.cloud_agent_id;
  const dep = loadDeployments(platformRoot).find((d) => d.agent_id === agentId);
  return dep?.cloud_agent_id;
}
