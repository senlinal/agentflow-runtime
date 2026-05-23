import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { CheckpointManager } from "./CheckpointManager.ts";
import { CommandRunner } from "./CommandRunner.ts";
import { DiffCollector } from "./DiffCollector.ts";
import { assertSafeWritablePath, resolveInsideProject } from "./PathSafety.ts";
import type { AgentNode, ExecutionResult, NodeExecutor, WorkflowContext } from "../types.ts";

type FileWrite = {
  path: string;
  content: string;
  overwrite?: boolean;
};

type CodeExecutorConfig = {
  projectRoot?: string;
  cwd?: string;
  dryRun?: boolean;
  timeoutMs?: number;
  commands?: string[];
  fileWrites?: FileWrite[];
  maxFilesChanged?: number;
  maxPatchSize?: number;
  allowFileCreate?: boolean;
  allowFileModify?: boolean;
  allowFileDelete?: boolean;
};

export class CodeExecutor implements NodeExecutor {
  private readonly options: {
    projectRoot?: string;
    commandRunner?: CommandRunner;
    diffCollector?: DiffCollector;
    checkpointManager?: CheckpointManager;
  };

  constructor(options: {
    projectRoot?: string;
    commandRunner?: CommandRunner;
    diffCollector?: DiffCollector;
    checkpointManager?: CheckpointManager;
  } = {}) {
    this.options = options;
  }

  async execute(node: AgentNode, _context: WorkflowContext): Promise<ExecutionResult> {
    const config = normalizeConfig(node.executorConfig);
    const projectRoot = resolve(this.options.projectRoot ?? config.projectRoot ?? process.cwd());
    const cwd = config.cwd ? resolveInsideProject(config.cwd, projectRoot) : projectRoot;
    const commandRunner = this.options.commandRunner ?? new CommandRunner();
    const diffCollector = this.options.diffCollector ?? new DiffCollector(projectRoot);
    const checkpointManager = this.options.checkpointManager ?? new CheckpointManager(projectRoot);

    const checkpoint = await checkpointManager.createCheckpoint({ cwd });
    const completedSteps: string[] = [`Created checkpoint ${checkpoint.checkpointId}`];
    const artifacts: string[] = [];
    const errors: string[] = [];
    const commandResults = [];

    if (config.dryRun) {
      completedSteps.push("Dry-run only; no files or commands were changed.");
    } else {
      for (const fileWrite of config.fileWrites) {
        try {
          const filePath = assertSafeWritablePath(fileWrite.path, projectRoot);
          const existing = await exists(filePath);
          if (!existing && !config.allowFileCreate) {
            throw new Error(`File creation is disabled for this code executor: ${fileWrite.path}`);
          }
          if (existing && !config.allowFileModify) {
            throw new Error(`File modification is disabled for this code executor: ${fileWrite.path}`);
          }
          if (existing && !fileWrite.overwrite) {
            throw new Error(`Refusing to overwrite existing file without overwrite=true: ${fileWrite.path}`);
          }
          await mkdir(dirname(filePath), { recursive: true });
          await writeFile(filePath, fileWrite.content, "utf8");
          artifacts.push(relative(projectRoot, filePath));
          completedSteps.push(`Wrote ${relative(projectRoot, filePath)}`);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }

      for (const command of config.commands) {
        try {
          const result = await commandRunner.run({
            command,
            cwd,
            projectRoot,
            timeoutMs: config.timeoutMs,
          });
          commandResults.push(result);
          completedSteps.push(`Ran ${command}`);
          if (result.timedOut) errors.push(`${command} timed out.`);
          if (result.exitCode !== 0) errors.push(`${command} exited with ${result.exitCode}.`);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    }

    const diff = await diffCollector.collect({ cwd });
    const filesChangedBefore = parseStatusFiles(checkpoint.statusBefore);
    const filesChangedByExecutor = diff.filesChanged.filter((file) => !filesChangedBefore.has(file));
    if (filesChangedByExecutor.length > config.maxFilesChanged) {
      errors.push(`Changed files exceed maxFilesChanged=${config.maxFilesChanged}: ${filesChangedByExecutor.length}`);
    }
    if (filesChangedByExecutor.length > 0 && diff.patchPreview.length > config.maxPatchSize) {
      errors.push(`Patch preview exceeds maxPatchSize=${config.maxPatchSize}: ${diff.patchPreview.length}`);
    }
    if (diff.hasChanges) {
      artifacts.push(...filesChangedByExecutor.filter((file) => !artifacts.includes(file)));
    }

    return {
      status: errors.length === 0 ? "success" : "failed",
      completedSteps,
      artifacts,
      summary: errors.length === 0
        ? `Code executor completed with ${artifacts.length} artifact(s) and ${commandResults.length} command(s).`
        : `Code executor completed with ${errors.length} error(s).`,
      errors,
      rawOutput: JSON.stringify({ checkpoint, commandResults, diff, filesChangedByExecutor }, null, 2),
    };
  }
}

function normalizeConfig(raw: unknown): Required<CodeExecutorConfig> {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return {
    projectRoot: typeof record.projectRoot === "string" ? record.projectRoot : "",
    cwd: typeof record.cwd === "string" ? record.cwd : "",
    dryRun: record.dryRun === true,
    timeoutMs: typeof record.timeoutMs === "number" ? record.timeoutMs : 120_000,
    commands: Array.isArray(record.commands) ? record.commands.filter((item): item is string => typeof item === "string") : [],
    fileWrites: Array.isArray(record.fileWrites) ? record.fileWrites.map(normalizeFileWrite) : [],
    maxFilesChanged: typeof record.maxFilesChanged === "number" ? record.maxFilesChanged : 3,
    maxPatchSize: typeof record.maxPatchSize === "number" ? record.maxPatchSize : 20_000,
    allowFileCreate: record.allowFileCreate !== false,
    allowFileModify: record.allowFileModify !== false,
    allowFileDelete: record.allowFileDelete === true,
  };
}

function normalizeFileWrite(raw: unknown): FileWrite {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("fileWrites entries must be objects.");
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.path !== "string" || !record.path) throw new Error("fileWrites[].path must be a string.");
  if (typeof record.content !== "string") throw new Error("fileWrites[].content must be a string.");
  return { path: record.path, content: record.content, overwrite: record.overwrite === true };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function parseStatusFiles(status: string): Set<string> {
  return new Set(
    status
      .split(/\r?\n/)
      .map((line) => line.slice(3).trim())
      .filter(Boolean),
  );
}
