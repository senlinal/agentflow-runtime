import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { isInsidePath } from "./PathSafety.ts";

export type ExecutionCheckpoint = {
  checkpointId: string;
  cwd: string;
  head: string | null;
  statusBefore: string;
  createdAt: string;
  rollbackNote: string;
};

export class CheckpointManager {
  private readonly projectRoot: string;

  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  async createCheckpoint(options: { cwd?: string } = {}): Promise<ExecutionCheckpoint> {
    const cwd = resolve(options.cwd ?? this.projectRoot);
    if (!isInsidePath(cwd, this.projectRoot)) {
      throw new Error(`Checkpoint cwd is outside the project root: ${cwd}`);
    }
    const head = await gitOrNull(["rev-parse", "HEAD"], cwd);
    const status = await gitOrNull(["status", "--short", "--untracked-files=all"], cwd);
    return {
      checkpointId: `checkpoint_${randomUUID()}`,
      cwd,
      head: head?.trim() || null,
      statusBefore: status ?? "",
      createdAt: new Date().toISOString(),
      rollbackNote: "Automatic destructive rollback is intentionally not performed. Use the checkpoint diff to review and revert safely.",
    };
  }
}

async function gitOrNull(args: string[], cwd: string): Promise<string | null> {
  return await new Promise((resolveResult) => {
    const child = spawn("git", args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.on("error", () => resolveResult(null));
    child.on("close", (exitCode) => {
      resolveResult(exitCode === 0 ? stdout : null);
    });
  });
}
