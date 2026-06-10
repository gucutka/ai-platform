/**
 * Commercial licensing, SKU resolution, and entitlement evaluation.
 */

import {
  loadCloudAgentCatalog,
  loadCloudAgentManifest,
  type CloudAgentCatalog,
} from "./cloud-agent-catalog.js";
import type { Manifest } from "./types.js";

export interface SkuPricing {
  label?: string;
  list_price_usd_per_month?: number;
  description?: string;
}

export interface PackagePricing extends SkuPricing {
  agents?: string[];
}

export interface CommercialConfig {
  currency: string;
  billing_unit?: string;
  skus?: Record<string, SkuPricing>;
  packages?: Record<string, PackagePricing>;
}

export interface LicenseEvaluation {
  contract: "LicenseEvaluation";
  version: "1.0";
  mode: "all_agents" | "restricted";
  purchased: string[];
  expanded_agents: string[];
  packages: Array<{ id: string; label: string; agents: string[] }>;
  standalone_agents: string[];
}

export function loadCommercialConfig(platformRoot?: string): CommercialConfig {
  const catalog = loadCloudAgentCatalog(platformRoot) as CloudAgentCatalog & {
    commercial?: CommercialConfig;
  };
  return (
    catalog.commercial ?? {
      currency: "USD",
      billing_unit: "estimated_tokens",
      skus: {},
      packages: {},
    }
  );
}

export function resolveAgentSku(agentId: string, platformRoot?: string): string {
  try {
    return loadCloudAgentManifest(agentId, platformRoot).sku;
  } catch {
    return `unknown:${agentId}`;
  }
}

export function expandPurchasedAgents(
  purchased: string[] | undefined,
  platformRoot?: string
): { agents: string[]; packages: LicenseEvaluation["packages"]; standalone: string[] } {
  if (!purchased?.length) {
    return { agents: [], packages: [], standalone: [] };
  }

  const catalog = loadCloudAgentCatalog(platformRoot);
  const agentSet = new Set<string>();
  const packages: LicenseEvaluation["packages"] = [];
  const standalone: string[] = [];

  for (const item of purchased) {
    const pack = catalog.packages?.[item];
    if (pack) {
      packages.push({
        id: item,
        label: pack.label,
        agents: [...pack.agents],
      });
      for (const a of pack.agents) agentSet.add(a);
    } else if (catalog.agents[item]) {
      standalone.push(item);
      agentSet.add(item);
    }
  }

  return { agents: [...agentSet], packages, standalone };
}

export function evaluateLicenseStatus(
  manifest: Manifest,
  platformRoot?: string
): LicenseEvaluation {
  const purchased = manifest.purchased_agents ?? [];
  if (!purchased.length) {
    return {
      contract: "LicenseEvaluation",
      version: "1.0",
      mode: "all_agents",
      purchased: [],
      expanded_agents: [],
      packages: [],
      standalone_agents: [],
    };
  }

  const { agents, packages, standalone } = expandPurchasedAgents(purchased, platformRoot);
  return {
    contract: "LicenseEvaluation",
    version: "1.0",
    mode: "restricted",
    purchased: [...purchased],
    expanded_agents: agents,
    packages,
    standalone_agents: standalone,
  };
}

export function listSellablePackages(platformRoot?: string): Array<{
  id: string;
  label: string;
  agents: string[];
  list_price_usd_per_month?: number;
}> {
  const catalog = loadCloudAgentCatalog(platformRoot);
  const commercial = loadCommercialConfig(platformRoot);
  return Object.entries(catalog.packages ?? {}).map(([id, pack]) => ({
    id,
    label: pack.label,
    agents: pack.agents,
    list_price_usd_per_month: commercial.packages?.[id]?.list_price_usd_per_month,
  }));
}

export function skuLabel(sku: string, platformRoot?: string): string {
  const commercial = loadCommercialConfig(platformRoot);
  return commercial.skus?.[sku]?.label ?? sku;
}

export function packageListPrice(
  packageId: string,
  platformRoot?: string
): number | undefined {
  return loadCommercialConfig(platformRoot).packages?.[packageId]?.list_price_usd_per_month;
}
