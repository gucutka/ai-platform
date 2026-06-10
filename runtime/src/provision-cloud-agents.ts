import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getPlatformRoot } from "./config.js";
import {
  loadCloudAgentCatalog,
  loadCloudAgentManifest,
  saveDeployments,
  type CloudAgentDeploymentRecord,
  type CloudAgentManifest,
  type CloudAgentCatalogEntry,
} from "./cloud-agent-catalog.js";

export interface ProvisionResult {
  contract: "CloudAgentProvisionResult";
  version: "1.0";
  provisioned: number;
  updated: number;
  skipped: number;
  deployments: CloudAgentDeploymentRecord[];
  manifest_paths: string[];
}

/** Resolve the definition file (.agent.yaml, legacy manifest fallback) for a catalog entry. */
function catalogEntryPath(
  platformRoot: string,
  entry: Pick<CloudAgentCatalogEntry, "agent" | "manifest">
): string {
  const rel = entry.agent ?? entry.manifest;
  if (!rel) {
    throw new Error("Catalog entry missing agent or manifest path");
  }
  return path.join(platformRoot, "cloud-agents", rel);
}

/**
 * Record local deployment state from the canonical agent definitions.
 * Source of truth is `cloud-agents/agents/*.agent.yaml`; this no longer
 * generates legacy manifests.
 */
export function provisionCloudAgents(opts?: {
  platformRoot?: string;
  agentIds?: string[];
  dryRun?: boolean;
}): ProvisionResult {
  const platformRoot = opts?.platformRoot ?? getPlatformRoot();
  const catalog = loadCloudAgentCatalog(platformRoot);
  const ids =
    opts?.agentIds?.length ?
      opts.agentIds
    : Object.keys(catalog.agents);

  const now = new Date().toISOString();
  const deployments: CloudAgentDeploymentRecord[] = [];
  const manifest_paths: string[] = [];
  let provisioned = 0;
  let updated = 0;
  let skipped = 0;

  for (const agentId of ids) {
    const entry = catalog.agents[agentId];
    if (!entry) {
      skipped += 1;
      continue;
    }

    let definitionPath: string;
    try {
      definitionPath = catalogEntryPath(platformRoot, entry);
    } catch {
      skipped += 1;
      continue;
    }
    const existed = fs.existsSync(definitionPath);
    manifest_paths.push(definitionPath);

    let manifest: CloudAgentManifest | null = null;
    try {
      manifest = loadCloudAgentManifest(agentId, platformRoot);
    } catch {
      manifest = null;
    }

    deployments.push({
      agent_id: agentId,
      cloud_agent_name: manifest?.cloud_agent_name ?? `ai-platform-${agentId}`,
      cloud_agent_id: manifest?.cloud_agent_id,
      sku: entry.sku,
      status: manifest?.cloud_agent_id ? "provisioned" : "local",
      updated_at: now,
    });

    if (existed) updated += 1;
    else provisioned += 1;
  }

  if (!opts?.dryRun) {
    saveDeployments(deployments, platformRoot);
  }

  return {
    contract: "CloudAgentProvisionResult",
    version: "1.0",
    provisioned,
    updated,
    skipped,
    deployments,
    manifest_paths,
  };
}

/** Set cloud_agent_id after manual registration in Claude Console / API. */
export function registerCloudAgentId(opts: {
  agentId: string;
  cloudAgentId: string;
  platformRoot?: string;
}): CloudAgentManifest {
  const platformRoot = opts.platformRoot ?? getPlatformRoot();
  const catalog = loadCloudAgentCatalog(platformRoot);
  const entry = catalog.agents[opts.agentId];
  if (!entry) throw new Error(`Unknown agent: ${opts.agentId}`);

  const definitionPath = catalogEntryPath(platformRoot, entry);
  const raw = YAML.parse(fs.readFileSync(definitionPath, "utf8")) as Record<string, unknown> & {
    metadata?: Record<string, unknown>;
    cloud_agent_id?: string;
  };
  if (raw.metadata && typeof raw.metadata === "object") {
    raw.metadata.cloud_agent_id = opts.cloudAgentId;
  } else {
    raw.cloud_agent_id = opts.cloudAgentId;
  }
  fs.writeFileSync(definitionPath, YAML.stringify(raw));

  const deployments = provisionCloudAgents({
    platformRoot,
    agentIds: [opts.agentId],
  }).deployments;
  saveDeployments(deployments, platformRoot);
  return loadCloudAgentManifest(opts.agentId, platformRoot);
}
