import { evaluateProjectLifecycle } from "../project-lifecycle.js";
import type { Manifest } from "../types.js";
import { buildArchitectureContextParts, loadApprovedLayerSnippet } from "./architecture-context.js";

export interface DevelopmentReadiness {
  ready: boolean;
  development_enabled: boolean;
  missing: string[];
  block_message?: string;
}

export function evaluateDevelopmentReadiness(opts: {
  projectDir: string;
  manifest: Manifest;
}): DevelopmentReadiness {
  const lifecycle = evaluateProjectLifecycle({
    projectDir: opts.projectDir,
    manifest: opts.manifest,
  });

  if (!lifecycle.enabled) {
    return {
      ready: true,
      development_enabled: true,
      missing: [],
    };
  }

  const ready = lifecycle.development_enabled;
  const missing = lifecycle.missing_for_development;

  return {
    ready,
    development_enabled: lifecycle.development_enabled,
    missing,
    block_message: ready ?
      undefined
    : [
        "## Development / feature intake blocked",
        "",
        "Complete **discovery** and **architecture** before creating pipeline issues:",
        "",
        ...missing.map((m) => `- \`${m}\``),
        "",
        "Approve business and technical knowledge layers, then retry.",
      ].join("\n"),
  };
}

/** Context for feature-intake agent — approved knowledge + technical ADRs. */
export function buildDevelopmentContextParts(projectDir: string): string[] {
  return [
    loadApprovedLayerSnippet(projectDir, "business", 3000),
    loadApprovedLayerSnippet(projectDir, "product", 2000),
    ...buildArchitectureContextParts(projectDir),
  ].filter(Boolean);
}
