import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { OpenCodeSessionFileTracker } from "./OpenCodeSessionFileTracker.ts";

export type PolicyAction = "allow" | "ask" | "deny";
export type PolicyRiskLevel = "low" | "medium" | "high";

export type PolicyDecision = {
  action: PolicyAction;
  riskLevel: PolicyRiskLevel;
  reason: string;
  matchedRule: string;
  affectedPaths: string[];
};

const LOW_RISK_PREFIXES = [
  "npm run demo",
  "npm run demo:feasible",
  "npm run demo:infeasible",
  "npm run test",
  "npm run typecheck",
  "npm run workflow",
  "npm run workflow:",
  "npm run opencode:check",
  "node ",
  "pwd",
  "ls",
  "cat ",
  "grep ",
  "rg ",
  "find ",
];

const PROTECTED_DIRS = [
  "workflows",
  "core",
  "cli",
  "adapters",
  "tests",
  "docs",
  "roles",
  "inputs",
  "template-specs",
];

export class ShellRiskClassifier {
  private readonly projectRoot: string;
  private readonly tracker: OpenCodeSessionFileTracker;

  constructor(projectRoot = process.cwd(), tracker = new OpenCodeSessionFileTracker(projectRoot)) {
    this.projectRoot = resolve(projectRoot);
    this.tracker = tracker;
  }

  classify(command: string): PolicyDecision {
    const normalized = command.trim();
    if (!normalized) return allow("Empty bash command.", "empty-command");

    const externalPath = firstExternalPath(normalized, this.projectRoot);
    if (externalPath) {
      return ask(`Command references a path outside the project: ${externalPath}`, "external-path", [externalPath]);
    }

    if (/\bcurl\b[\s\S]*\|\s*(sh|bash)\b/.test(normalized) || /\bwget\b[\s\S]*\|\s*(sh|bash)\b/.test(normalized)) {
      return ask("Remote download is piped into a shell.", "remote-script-pipe");
    }

    if (/\bgit\s+reset\s+--hard\b/.test(normalized)) {
      return ask("git reset --hard can discard local work.", "git-reset-hard");
    }

    if (/\bgit\s+clean\s+-(fd|xdf|df|fxd)\b/.test(normalized)) {
      return ask("git clean can delete untracked files.", "git-clean");
    }

    if (/\bsudo\b/.test(normalized)) {
      return ask("sudo command requires explicit approval.", "sudo");
    }

    if (/\b(chmod|chown)\s+-R\b/.test(normalized)) {
      return ask("Recursive permission or ownership changes are high risk.", "recursive-permission-change");
    }

    const deleteDecision = this.classifyDeletion(normalized);
    if (deleteDecision) return deleteDecision;

    if (/^\s*curl\s+\S+/.test(normalized) && !normalized.includes("|")) {
      return allow("Read-only curl without shell execution.", "curl-readonly");
    }

    if (LOW_RISK_PREFIXES.some((prefix) => normalized === prefix.trim() || normalized.startsWith(prefix))) {
      return allow("Recognized low-risk local command.", "low-risk-command");
    }

    if (/(\brm\b|\bunlink\b|\brmdir\b|\btrash\b)/.test(normalized)) {
      return ask("Potential deletion command could not be fully classified.", "unclassified-delete");
    }

    return allow("No high-risk shell pattern matched.", "default-allow");
  }

  private classifyDeletion(command: string): PolicyDecision | null {
    const deletionMatch = command.match(/(?:^|[;&|]\s*)(rm|unlink|rmdir|trash)\s+([^;&|]+)/);
    if (!deletionMatch) return null;

    const operation = deletionMatch[1];
    const rest = deletionMatch[2];
    const forceRecursive = operation === "rm" && /(^|\s)-[^\s]*r[^\s]*f|(^|\s)-[^\s]*f[^\s]*r/.test(rest.toLowerCase());
    const paths = extractPathArgs(rest).map((path) => resolve(this.projectRoot, path));
    if (paths.length === 0) return ask("Deletion command has no clearly parsed target.", "delete-unknown-target");

    const external = paths.find((path) => !isProjectPath(path, this.projectRoot));
    if (external) return ask(`Deletion target is outside the project: ${external}`, "delete-external-path", [external]);

    const nonSessionTargets = paths.filter((path) => !this.tracker.isCreatedInSession(path));
    if (forceRecursive && nonSessionTargets.length > 0) {
      return ask("rm -rf on files or directories not created in this session requires confirmation.", "rm-rf-existing", paths);
    }

    if (nonSessionTargets.length === 0) {
      return allow("Deletion only targets files created in this session.", "delete-session-created", paths);
    }

    const protectedTarget = nonSessionTargets.find((path) => isProtectedProjectPath(path, this.projectRoot));
    if (protectedTarget || nonSessionTargets.some((path) => existsSync(path))) {
      return ask("Deleting existing project files requires user confirmation.", "delete-existing-project-file", paths);
    }

    return ask("Deletion target was not created in this session.", "delete-not-session-created", paths);
  }
}

export function isProjectPath(path: string, projectRoot = process.cwd()): boolean {
  const absolute = resolve(projectRoot, path);
  const root = resolve(projectRoot);
  return absolute === root || absolute.startsWith(`${root}/`);
}

function isProtectedProjectPath(path: string, projectRoot: string): boolean {
  const root = resolve(projectRoot);
  return PROTECTED_DIRS.some((dir) => {
    const protectedRoot = resolve(root, dir);
    return path === protectedRoot || path.startsWith(`${protectedRoot}/`);
  });
}

function firstExternalPath(command: string, projectRoot: string): string | null {
  for (const token of command.match(/(?:^|\s)(\/[^\s;&|]+)/g) ?? []) {
    const cleaned = token.trim().replace(/^['"]|['"]$/g, "");
    if (cleaned.startsWith("/tmp/") || cleaned.startsWith("/var/folders/")) continue;
    if (!isProjectPath(cleaned, projectRoot)) return cleaned;
  }
  return null;
}

function extractPathArgs(args: string): string[] {
  return args
    .split(/\s+/)
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter((item) => item && !item.startsWith("-") && !item.includes("="));
}

function allow(reason: string, matchedRule: string, affectedPaths: string[] = []): PolicyDecision {
  return { action: "allow", riskLevel: "low", reason, matchedRule, affectedPaths };
}

function ask(reason: string, matchedRule: string, affectedPaths: string[] = []): PolicyDecision {
  return { action: "ask", riskLevel: "high", reason, matchedRule, affectedPaths };
}
