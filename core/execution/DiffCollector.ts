import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { isInsidePath } from "./PathSafety.ts";

export type DiffSummary = {
  hasChanges: boolean;
  filesChanged: string[];
  stat: string;
  patchPreview: string;
};

export class DiffCollector {
  private readonly projectRoot: string;

  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  async collect(options: { cwd?: string; maxPatchChars?: number } = {}): Promise<DiffSummary> {
    const cwd = resolve(options.cwd ?? this.projectRoot);
    if (!isInsidePath(cwd, this.projectRoot)) {
      throw new Error(`Diff cwd is outside the project root: ${cwd}`);
    }
    const [files, status, stat, patch] = await Promise.all([
      runGit(["diff", "--name-only"], cwd),
      runGit(["status", "--porcelain", "--untracked-files=all"], cwd),
      runGit(["diff", "--stat"], cwd),
      runGit(["diff", "--"], cwd),
    ]);
    const patchPreview = truncate(patch.stdout, options.maxPatchChars ?? 12_000);
    const filesChanged = unique([
      ...files.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
      ...status.stdout.split(/\r?\n/).map((line) => line.slice(3).trim()).filter(Boolean),
    ]);
    return {
      hasChanges: filesChanged.length > 0,
      filesChanged,
      stat: stat.stdout.trim(),
      patchPreview,
    };
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

async function runGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return await new Promise((resolveResult, reject) => {
    const child = spawn("git", args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolveResult({ stdout, stderr, exitCode });
    });
  });
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}
