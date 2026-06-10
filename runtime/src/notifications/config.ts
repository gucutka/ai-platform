import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getPlatformRoot } from "../config.js";
import type { NotificationsConfig, SdlcNotificationEventType } from "./types.js";

export function notificationsConfigPath(projectDir: string): string {
  return path.join(projectDir, ".ai-platform", "notifications.yaml");
}

export function defaultNotificationsTemplatePath(platformRoot?: string): string {
  return path.join(platformRoot ?? getPlatformRoot(), "templates", "notifications.yaml");
}

const DEFAULT: NotificationsConfig = {
  version: "1.0",
  enabled: false,
  provider: "stdio",
  channel_id: "dev-notifications",
  events: {
    pr_created: true,
    review_pass: true,
    merged: true,
    released: true,
  },
};

export function loadNotificationsConfig(
  projectDir: string,
  platformRoot?: string
): NotificationsConfig {
  const projectFile = notificationsConfigPath(projectDir);
  if (fs.existsSync(projectFile)) {
    return { ...DEFAULT, ...(YAML.parse(fs.readFileSync(projectFile, "utf8")) as NotificationsConfig) };
  }
  const template = defaultNotificationsTemplatePath(platformRoot);
  if (fs.existsSync(template)) {
    return { ...DEFAULT, ...(YAML.parse(fs.readFileSync(template, "utf8")) as NotificationsConfig) };
  }
  return DEFAULT;
}

export function isEventEnabled(
  config: NotificationsConfig,
  event: SdlcNotificationEventType
): boolean {
  if (config.events && config.events[event] === false) return false;
  return true;
}

export function saveNotificationsConfig(projectDir: string, config: NotificationsConfig): string {
  const dest = notificationsConfigPath(projectDir);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, YAML.stringify(config));
  return dest;
}
