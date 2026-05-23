import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readdir, realpath, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { isInsidePath } from "../execution/PathSafety.ts";

export type ImportedProjectWorkspace = {
  importId: string;
  sourceProjectPath: string;
  workspaceRoot: string;
  copiedFilesCount: number;
  excludedPaths: string[];
  createdAt: string;
};

export type ExternalProjectImportOptions = {
  sourceProjectPath: string;
  tempRoot?: string;
  allowCurrentRepoRoot?: boolean;
  additionalExcludeNames?: string[];
};

const DEFAULT_EXCLUDE_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  ".env",
  ".workflow-runs",
  ".agentflow",
]);

const SYSTEM_SENSITIVE_ROOTS = [
  "/",
  "/System",
  "/Library",
  "/bin",
  "/sbin",
  "/usr",
  "/etc",
  "/private/etc",
];

export class ExternalProjectImporter {
  async importProject(options: ExternalProjectImportOptions): Promise<ImportedProjectWorkspace> {
    const sourceProjectPath = await validateSourceProjectPath(options.sourceProjectPath, options.allowCurrentRepoRoot === true);
    const importId = `external_import_${randomUUID().slice(0, 12)}`;
    const workspaceRoot = await mkdtemp(join(options.tempRoot ?? tmpdir(), `${importId}-`));
    const excludedPaths: string[] = [];
    const excludeNames = new Set([...DEFAULT_EXCLUDE_NAMES, ...(options.additionalExcludeNames ?? [])]);

    await cp(sourceProjectPath, workspaceRoot, {
      recursive: true,
      dereference: false,
      filter: async (source) => {
        if (source === sourceProjectPath) return true;
        const relativePath = source.slice(sourceProjectPath.length + 1);
        const parts = relativePath.split(/[\\/]/).filter(Boolean);
        const shouldExclude = parts.some((part) => excludeNames.has(part)) || relativePath.startsWith(".opencode/policy-runs") || relativePath.startsWith(".agentflow/executions");
        if (shouldExclude) {
          excludedPaths.push(relativePath);
          return false;
        }
        return true;
      },
    });

    return {
      importId,
      sourceProjectPath,
      workspaceRoot,
      copiedFilesCount: await countFiles(workspaceRoot),
      excludedPaths: [...new Set(excludedPaths)].sort(),
      createdAt: new Date().toISOString(),
    };
  }
}

async function validateSourceProjectPath(inputPath: string, allowCurrentRepoRoot: boolean): Promise<string> {
  if (!inputPath) throw new Error("sourceProjectPath is required.");
  const resolved = resolve(inputPath);
  const stats = await stat(resolved).catch((error: unknown) => {
    throw new Error(`sourceProjectPath does not exist: ${inputPath}; ${error instanceof Error ? error.message : String(error)}`);
  });
  if (!stats.isDirectory()) throw new Error(`sourceProjectPath must be a directory: ${inputPath}`);
  const actual = await realpath(resolved);
  if (isSystemSensitivePath(actual)) throw new Error(`Refusing to import a system-sensitive directory: ${actual}`);
  if (!allowCurrentRepoRoot && isCurrentRepoRoot(actual)) {
    throw new Error(`Refusing to import the current repository root without allowCurrentRepoRoot=true: ${actual}`);
  }
  return actual;
}

function isSystemSensitivePath(path: string): boolean {
  if (SYSTEM_SENSITIVE_ROOTS.includes(path)) return true;
  const home = homedir();
  return path === home || SYSTEM_SENSITIVE_ROOTS.some((root) => root !== "/" && isInsidePath(path, root));
}

function isCurrentRepoRoot(path: string): boolean {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (result.status !== 0) return false;
  return resolve(result.stdout.trim()) === resolve(path);
}

async function countFiles(root: string): Promise<number> {
  let count = 0;
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      count += await countFiles(path);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      count += 1;
    }
  }
  return count;
}

export function defaultExternalProjectExcludes(): string[] {
  return [...DEFAULT_EXCLUDE_NAMES].sort();
}
