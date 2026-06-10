import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getPlatformRoot } from "./config.js";

export interface RoutingPathDef {
  risk: string[];
  sdlc_path: string[];
  skip_stages: string[];
  mandatory_agents: string[] | "all_sdlc";
  review_level?: string;
}

export interface RoutingRules {
  version: string;
  paths: {
    low_risk: RoutingPathDef;
    medium_feature: RoutingPathDef;
    high_risk: RoutingPathDef;
  };
  implement_routing: Record<string, string>;
}

let cached: RoutingRules | null = null;

export function loadRoutingRules(): RoutingRules {
  if (cached) return cached;
  const file = path.join(getPlatformRoot(), "policies", "routing-rules.yaml");
  const raw = YAML.parse(fs.readFileSync(file, "utf8")) as RoutingRules;
  cached = raw;
  return raw;
}
