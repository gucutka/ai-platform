import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getPlatformRoot } from "../config.js";
import type { ChannelBinding, ChannelsConfig } from "./types.js";

export function channelsConfigPath(projectDir: string): string {
  return path.join(projectDir, ".ai-platform", "channels.yaml");
}

export function defaultChannelsTemplatePath(platformRoot?: string): string {
  return path.join(platformRoot ?? getPlatformRoot(), "templates", "channels.yaml");
}

const DEFAULT_CONFIG: ChannelsConfig = {
  version: "1.0",
  enabled: true,
  default_provider: "slack",
  bindings: [],
};

export function loadChannelsConfig(
  projectDir: string,
  platformRoot?: string
): ChannelsConfig {
  const projectFile = channelsConfigPath(projectDir);
  if (fs.existsSync(projectFile)) {
    return YAML.parse(fs.readFileSync(projectFile, "utf8")) as ChannelsConfig;
  }
  const template = defaultChannelsTemplatePath(platformRoot);
  if (fs.existsSync(template)) {
    return YAML.parse(fs.readFileSync(template, "utf8")) as ChannelsConfig;
  }
  return DEFAULT_CONFIG;
}

export function saveChannelsConfig(projectDir: string, config: ChannelsConfig): string {
  const dest = channelsConfigPath(projectDir);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, YAML.stringify(config));
  return dest;
}

function matchChannelPattern(pattern: string, channelId: string): boolean {
  if (pattern === channelId) return true;
  if (pattern.endsWith("*")) {
    return channelId.startsWith(pattern.slice(0, -1));
  }
  return false;
}

export function resolveChannelBinding(
  config: ChannelsConfig,
  channelId: string
): ChannelBinding | null {
  for (const binding of config.bindings) {
    if (matchChannelPattern(binding.channel_id, channelId)) {
      return binding;
    }
  }
  return null;
}

export function upsertChannelBinding(
  projectDir: string,
  binding: ChannelBinding
): ChannelsConfig {
  const config = loadChannelsConfig(projectDir);
  const idx = config.bindings.findIndex((b) => b.channel_id === binding.channel_id);
  if (idx >= 0) config.bindings[idx] = binding;
  else config.bindings.push(binding);
  saveChannelsConfig(projectDir, config);
  return config;
}

export function defaultAgentForPhase(phase: ChannelBinding["phase"]): string {
  switch (phase) {
    case "intake":
      return "project-intake-conversation-agent";
    case "discovery":
      return "requirements-conversation-agent";
    case "architecture":
      return "architecture-conversation-agent";
    case "development":
      return "feature-intake-conversation-agent";
    default:
      return "requirements-conversation-agent";
  }
}
