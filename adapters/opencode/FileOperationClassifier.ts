import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { OpenCodeSessionFileTracker } from "./OpenCodeSessionFileTracker.ts";
import { isProjectPath, type PolicyDecision } from "./ShellRiskClassifier.ts";

export type FileOperation = {
  type: "create" | "modify" | "delete" | "write" | "edit" | "apply_patch";
  path?: string;
  paths?: string[];
  patch?: string;
};

export class FileOperationClassifier {
  private readonly projectRoot: string;
  private readonly tracker: OpenCodeSessionFileTracker;

  constructor(projectRoot = process.cwd(), tracker = new OpenCodeSessionFileTracker(projectRoot)) {
    this.projectRoot = resolve(projectRoot);
    this.tracker = tracker;
  }

  classify(operation: FileOperation): PolicyDecision {
    const paths = this.pathsFromOperation(operation);
    const externalPath = paths.find((path) => !isProjectPath(path, this.projectRoot));
    if (externalPath) return ask(`File operation targets a path outside the project: ${externalPath}`, "file-external-path", [externalPath]);

    const privateKeyPath = paths.find((path) => isPrivateKeyPath(path));
    if (privateKeyPath) return deny(`File operation targets a private key file: ${privateKeyPath}`, "private-key-file", [privateKeyPath]);

    const sensitivePath = paths.find((path) => isSensitivePath(path));
    if (sensitivePath) return ask(`File operation targets a sensitive file: ${sensitivePath}`, "sensitive-file", [sensitivePath]);

    if (operation.type === "delete") {
      if (paths.length === 0) return ask("Delete operation did not include a parseable path.", "delete-missing-path");
      if (paths.every((path) => this.tracker.isCreatedInSession(path))) {
        paths.forEach((path) => this.tracker.markDeleted(path));
        return allow("Deleting only files created in this session.", "delete-session-created", paths);
      }
      return ask("Deleting existing project files requires user confirmation.", "delete-existing-project-file", paths);
    }

    if (operation.type === "apply_patch") {
      if (operation.patch && looksLikeLargeDeletePatch(operation.patch)) {
        return ask("Patch appears to delete many lines or files.", "large-delete-patch", paths);
      }
      if (operation.patch && /^\*\*\* Delete File:/m.test(operation.patch)) {
        const deletePaths = [...operation.patch.matchAll(/^\*\*\* Delete File:\s+(.+)$/gm)].map((match) =>
          resolve(this.projectRoot, match[1].trim())
        );
        if (deletePaths.every((path) => this.tracker.isCreatedInSession(path))) {
          deletePaths.forEach((path) => this.tracker.markDeleted(path));
          return allow("Patch deletes only files created in this session.", "patch-delete-session-created", deletePaths);
        }
        return ask("Patch deletes existing project files.", "patch-delete-existing-file", deletePaths);
      }
    }

    if (operation.type === "create" || (operation.type === "write" && paths.some((path) => !existsSync(path)))) {
      paths.filter((path) => !existsSync(path)).forEach((path) => this.tracker.markCreated(path));
      return allow("Creating a new project file is allowed.", "create-file", paths);
    }

    if (operation.type === "write" || operation.type === "edit" || operation.type === "modify" || operation.type === "apply_patch") {
      return allow("Modifying existing project files is allowed.", "modify-existing-file", paths);
    }

    return ask("Unknown file operation type.", "unknown-file-operation", paths);
  }

  private pathsFromOperation(operation: FileOperation): string[] {
    const paths = [...(operation.paths ?? [])];
    if (operation.path) paths.push(operation.path);
    if (operation.patch) {
      for (const match of operation.patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File:\s+(.+)$/gm)) {
        paths.push(match[1].trim());
      }
    }
    return [...new Set(paths.map((path) => resolve(this.projectRoot, path)))];
  }
}

function isSensitivePath(path: string): boolean {
  return /(^|\/)\.env($|[./])/.test(path) || /(id_rsa|id_ed25519|private[_-]?key|credentials|token)/i.test(path);
}

function isPrivateKeyPath(path: string): boolean {
  return /(id_rsa|id_ed25519|private[_-]?key)/i.test(path);
}

function looksLikeLargeDeletePatch(patch: string): boolean {
  const deletedLines = patch.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
  return deletedLines >= 50;
}

function allow(reason: string, matchedRule: string, affectedPaths: string[] = []): PolicyDecision {
  return { action: "allow", riskLevel: "low", reason, matchedRule, affectedPaths };
}

function ask(reason: string, matchedRule: string, affectedPaths: string[] = []): PolicyDecision {
  return { action: "ask", riskLevel: "medium", reason, matchedRule, affectedPaths };
}

function deny(reason: string, matchedRule: string, affectedPaths: string[] = []): PolicyDecision {
  return { action: "deny", riskLevel: "high", reason, matchedRule, affectedPaths };
}
