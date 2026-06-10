import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type SastSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface SastFinding {
  id: string;
  severity: SastSeverity;
  title: string;
  file?: string;
  line?: number;
  message: string;
  category: "security";
  source: "npm-audit" | "pattern-scan";
}

export interface SastScanResult {
  contract: "SastScanResult";
  version: "1.0";
  scanned_at: string;
  findings: SastFinding[];
  npm_audit_ran: boolean;
  npm_audit_error?: string;
}

const SECRET_PATTERNS: { id: string; pattern: RegExp; severity: SastSeverity }[] = [
  { id: "secret-api-key", pattern: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}/i, severity: "critical" },
  { id: "secret-sk", pattern: /\bsk-[a-zA-Z0-9]{20,}/, severity: "critical" },
  { id: "secret-ghp", pattern: /\bghp_[a-zA-Z0-9]{20,}/, severity: "critical" },
  { id: "eval-usage", pattern: /\beval\s*\(/, severity: "high" },
  { id: "innerhtml", pattern: /\.innerHTML\s*=/, severity: "medium" },
];

function mapNpmSeverity(level?: string): SastSeverity {
  switch (String(level ?? "").toLowerCase()) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "moderate":
      return "medium";
    case "low":
      return "low";
    default:
      return "info";
  }
}

function runNpmAudit(projectDir: string): {
  findings: SastFinding[];
  ran: boolean;
  error?: string;
} {
  const pkg = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkg)) {
    return { findings: [], ran: false, error: "no package.json" };
  }

  try {
    const raw = execFileSync("npm", ["audit", "--json"], {
      cwd: projectDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });
    const data = JSON.parse(raw) as {
      vulnerabilities?: Record<
        string,
        {
          name?: string;
          severity?: string;
          via?: unknown[];
          range?: string;
        }
      >;
    };
    const findings: SastFinding[] = [];
    for (const [name, vuln] of Object.entries(data.vulnerabilities ?? {})) {
      findings.push({
        id: `npm-audit:${name}`,
        severity: mapNpmSeverity(vuln.severity),
        title: `npm audit: ${name}`,
        message: `Dependency vulnerability (${vuln.severity ?? "unknown"})${vuln.range ? ` — ${vuln.range}` : ""}`,
        category: "security",
        source: "npm-audit",
      });
    }
    return { findings, ran: true };
  } catch (err) {
    const execErr = err as { stdout?: string; status?: number };
    if (execErr.stdout) {
      try {
        const data = JSON.parse(execErr.stdout) as {
          vulnerabilities?: Record<string, { name?: string; severity?: string; range?: string }>;
        };
        const findings: SastFinding[] = [];
        for (const [name, vuln] of Object.entries(data.vulnerabilities ?? {})) {
          findings.push({
            id: `npm-audit:${name}`,
            severity: mapNpmSeverity(vuln.severity),
            title: `npm audit: ${name}`,
            message: `Dependency vulnerability (${vuln.severity ?? "unknown"})`,
            category: "security",
            source: "npm-audit",
          });
        }
        return { findings, ran: true };
      } catch {
        // fall through
      }
    }
    return {
      findings: [],
      ran: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function scanChangedFiles(
  files: { path: string; content: string }[] | undefined
): SastFinding[] {
  const findings: SastFinding[] = [];
  for (const file of files ?? []) {
    if (!file.path || file.content === undefined) continue;
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const rule of SECRET_PATTERNS) {
        if (rule.pattern.test(lines[i]!)) {
          findings.push({
            id: `${rule.id}:${file.path}:${i + 1}`,
            severity: rule.severity,
            title: rule.id,
            file: file.path,
            line: i + 1,
            message: `Pattern match (${rule.id}) in ${file.path}:${i + 1}`,
            category: "security",
            source: "pattern-scan",
          });
        }
      }
    }
  }
  return findings;
}

export function runDeterministicSast(
  projectDir: string,
  changedFiles?: { path: string; content: string }[]
): SastScanResult {
  const npm = runNpmAudit(projectDir);
  const patternFindings = scanChangedFiles(changedFiles);
  const findings = [...npm.findings, ...patternFindings];

  return {
    contract: "SastScanResult",
    version: "1.0",
    scanned_at: new Date().toISOString(),
    findings,
    npm_audit_ran: npm.ran,
    npm_audit_error: npm.error,
  };
}

export function sastHasCritical(findings: SastFinding[]): boolean {
  return findings.some((f) => f.severity === "critical");
}

export function mergeSastIntoSecurityReport(
  report: Record<string, unknown>,
  sast: SastScanResult
): Record<string, unknown> {
  const agentFindings = Array.isArray(report.findings) ? [...report.findings] : [];
  const seen = new Set(
    agentFindings.map((f) => {
      const o = f as { id?: string; file?: string; line?: number };
      return o.id ?? `${o.file}:${o.line}`;
    })
  );

  for (const f of sast.findings) {
    const key = f.id ?? `${f.file}:${f.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    agentFindings.push(f);
  }

  const hasCritical = agentFindings.some(
    (f) => String((f as { severity?: string }).severity ?? "").toLowerCase() === "critical"
  );
  const verdict = hasCritical
    ? "FAIL"
    : String(report.verdict ?? "PASS").toUpperCase();

  return {
    ...report,
    verdict,
    findings: agentFindings,
    sast_scan_included: true,
    sast_finding_count: sast.findings.length,
  };
}
