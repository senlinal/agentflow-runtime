import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInitialContext } from "../context.ts";
import { NodeRegistry } from "../NodeRegistry.ts";
import { PatchExportStore } from "../patch/PatchExportStore.ts";
import { hashCodeChangePlan } from "../repair/CodeChangePlanHasher.ts";
import { TraceStore, type TraceStoreResult } from "../TraceStore.ts";
import type { CodeChangePlan, TaskBrief, WorkflowContext } from "../types.ts";
import { WorkflowGraph } from "../WorkflowGraph.ts";
import { WorkflowRuntime } from "../WorkflowRuntime.ts";
import { WorkflowTemplateRegistry } from "../WorkflowTemplateRegistry.ts";
import { ExternalProjectImporter, type ImportedProjectWorkspace } from "./ExternalProjectImporter.ts";

export type ExternalProjectWorkspaceRunOptions = {
  sourceProjectPath: string;
  targetFile: string;
  content: string;
  testCommands: string[];
  taskBrief: TaskBrief;
  allowedFiles?: string[];
  forbiddenFiles?: string[];
  tempRoot?: string;
  executionRecordBaseDir?: string;
  externalRunBaseDir?: string;
  patchExportBaseDir?: string;
  allowCurrentRepoRoot?: boolean;
};

export type ExternalProjectWorkspaceRunResult = {
  importedWorkspace: ImportedProjectWorkspace;
  initialTestStatus: "passed" | "failed" | "not_run";
  finalTestStatus: "passed" | "failed";
  changedFiles: string[];
  patchPath: string;
  patchExportId?: string;
  patchMetadataPath?: string;
  patchApplyGuidePath?: string;
  patchHash?: string;
  executionId?: string;
  executionRecordPath?: string;
  rollbackGuidePath?: string;
  summaryPath: string;
  tracePath: string;
  finalContext: WorkflowContext;
  traceStore: TraceStoreResult;
};

export class ExternalProjectWorkspaceRunner {
  private readonly importer: ExternalProjectImporter;

  constructor(importer = new ExternalProjectImporter()) {
    this.importer = importer;
  }

  async run(options: ExternalProjectWorkspaceRunOptions): Promise<ExternalProjectWorkspaceRunResult> {
    const importedWorkspace = await this.importer.importProject({
      sourceProjectPath: options.sourceProjectPath,
      tempRoot: options.tempRoot,
      allowCurrentRepoRoot: options.allowCurrentRepoRoot,
    });
    await initializeGit(importedWorkspace.workspaceRoot);
    const initialTestStatus = options.testCommands.length > 0
      ? (await runCommandString(options.testCommands[0], importedWorkspace.workspaceRoot)).exitCode === 0 ? "passed" : "failed"
      : "not_run";

    const loaded = await new WorkflowTemplateRegistry().load("code-change-plan-execution");
    loaded.config.nodes = loaded.config.nodes.map((node) => node.id === "codeChangePlanExecutionRunner"
      ? {
          ...node,
          executorConfig: {
            projectRoot: importedWorkspace.workspaceRoot,
            cwd: importedWorkspace.workspaceRoot,
            timeoutMs: 120000,
            ...(options.executionRecordBaseDir ? { executionRecordBaseDir: options.executionRecordBaseDir } : {}),
          },
        }
      : node);

    const context = buildContext(options, importedWorkspace);
    const finalContext = await new WorkflowRuntime(
      new WorkflowGraph(loaded.config),
      NodeRegistry.withDefaults(),
    ).run(context);
    const changedFiles = await gitChangedFiles(importedWorkspace.workspaceRoot);
    const changedFileStatus = await gitChangedFileStatus(importedWorkspace.workspaceRoot);
    const patch = await gitDiff(importedWorkspace.workspaceRoot);
    const patchDir = join(options.externalRunBaseDir ?? join(".agentflow", "external-runs"), importedWorkspace.importId);
    await mkdir(patchDir, { recursive: true });
    const patchPath = join(patchDir, "changes.patch");
    await writeFile(patchPath, patch, "utf8");

    const finalTestStatus = finalContext.testExecutionResult?.status === "passed" ? "passed" : "failed";
    const patchExport = finalContext.codeChangePlanExecutionRecord?.executionId
      ? await new PatchExportStore(options.patchExportBaseDir).save({
          executionId: finalContext.codeChangePlanExecutionRecord.executionId,
          sourceProjectPath: importedWorkspace.sourceProjectPath,
          workspaceRoot: importedWorkspace.workspaceRoot,
          patchText: patch,
          changedFiles,
          filesAdded: changedFileStatus.added,
          filesModified: changedFileStatus.modified,
          filesDeleted: changedFileStatus.deleted,
          testStatus: finalTestStatus,
          verificationPass: finalContext.verification?.pass,
          warnings: ["Patch was generated from a copied workspace. It was not applied to the source project."],
        })
      : undefined;
    if (patchExport) finalContext.patchExportRecord = patchExport.record;
    finalContext.runtimeMetadata = {
      ...finalContext.runtimeMetadata,
      externalProject: {
        importId: importedWorkspace.importId,
        sourceProjectPath: importedWorkspace.sourceProjectPath,
        workspaceRoot: importedWorkspace.workspaceRoot,
        copiedFilesCount: importedWorkspace.copiedFilesCount,
        excludedPaths: importedWorkspace.excludedPaths,
        initialTestStatus,
        finalTestStatus,
        changedFiles,
        patchPath,
        patchExportId: patchExport?.record.patchExportId,
        patchMetadataPath: patchExport?.metadataPath,
        patchApplyGuidePath: patchExport?.applyGuidePath,
        patchHash: patchExport?.record.patchHash,
        executionId: finalContext.codeChangePlanExecutionRecord?.executionId,
        executionRecordPath: finalContext.codeChangePlanExecutionRecord?.executionRecordPath,
        rollbackGuidePath: finalContext.codeChangePlanExecutionRecord?.rollbackGuidePath,
      },
      patchExport: patchExport?.record,
    };
    const traceStore = await TraceStore.save(finalContext, {
      workflowName: loaded.config.workflow.name,
      templateVersion: loaded.config.workflow.version,
    });

    return {
      importedWorkspace,
      initialTestStatus,
      finalTestStatus,
      changedFiles,
      patchPath,
      patchExportId: patchExport?.record.patchExportId,
      patchMetadataPath: patchExport?.metadataPath,
      patchApplyGuidePath: patchExport?.applyGuidePath,
      patchHash: patchExport?.record.patchHash,
      executionId: finalContext.codeChangePlanExecutionRecord?.executionId,
      executionRecordPath: finalContext.codeChangePlanExecutionRecord?.executionRecordPath,
      rollbackGuidePath: finalContext.codeChangePlanExecutionRecord?.rollbackGuidePath,
      summaryPath: traceStore.summaryPath,
      tracePath: traceStore.tracePath,
      finalContext,
      traceStore,
    };
  }
}

function buildContext(options: ExternalProjectWorkspaceRunOptions, importedWorkspace: ImportedProjectWorkspace): WorkflowContext {
  const allowedFiles = options.allowedFiles ?? [options.targetFile];
  const forbiddenFiles = options.forbiddenFiles ?? [".env", ".env.local"];
  const context = createInitialContext({
    taskId: options.taskBrief.taskId,
    userGoal: options.taskBrief.goal,
    constraints: { allowedFiles, copiedWorkspaceOnly: true },
    successCriteria: options.taskBrief.successCriteria,
  });
  context.taskBrief = options.taskBrief;
  context.codingTaskContext = {
    allowedFiles,
    maxFilesChanged: Math.max(1, allowedFiles.length),
    maxPatchSize: 20000,
    allowFileDelete: false,
    successCriteria: options.taskBrief.successCriteria,
  };
  const plan: CodeChangePlan = {
    planId: `external_project_plan_${randomUUID().slice(0, 8)}`,
    repairPlanId: `external_project_repair_${importedWorkspace.importId}`,
    approvalId: `external_project_repair_approval_${randomUUID().slice(0, 8)}`,
    status: "materialized",
    summary: `Apply scoped change to ${options.targetFile} inside copied external project workspace.`,
    operations: [
      {
        id: "op_apply_scoped_change",
        type: "modify_file",
        targetFile: options.targetFile,
        content: options.content,
        description: `Replace ${options.targetFile} with approved scoped content.`,
        reason: options.taskBrief.goal,
        safetyConstraints: ["Copied workspace only.", "No delete_file.", "Target file must be allowed."],
      },
      ...options.testCommands.map((command, index) => ({
        id: `op_run_test_${index + 1}`,
        type: "run_test" as const,
        command,
        description: `Run configured test command: ${command}`,
        reason: "Verify the copied workspace after the scoped change.",
        safetyConstraints: ["Configured test command only."],
      })),
    ],
    targetFiles: allowedFiles,
    forbiddenFiles,
    testCommands: options.testCommands,
    riskLevel: "low",
    safetyChecks: ["copied workspace only", "hash-bound approval", "target files constrained", "configured tests only"],
    blockedOperations: [],
    executable: false,
    requiresExplicitExecutionApproval: true,
    createdAt: new Date().toISOString(),
  };
  context.codeChangePlan = plan;
  context.codeChangePlanExecutionApprovalRecord = {
    approvalId: `external_project_execution_approval_${randomUUID().slice(0, 8)}`,
    codeChangePlanId: plan.planId,
    codeChangePlanHash: hashCodeChangePlan(plan),
    status: "approved",
    requestedAction: "approve_code_change_plan_execution",
    approvedAt: new Date().toISOString(),
    approvedBy: "external-project-runner",
    note: "Approved for copied external project workspace only.",
  };
  context.runtimeMetadata = {
    executionVerification: {
      allowedFiles,
      maxFilesChanged: Math.max(1, allowedFiles.length),
      maxPatchSize: 20000,
    },
  };
  return context;
}

async function initializeGit(cwd: string): Promise<void> {
  await run("git", ["init"], cwd);
  await run("git", ["add", "."], cwd);
  await run("git", ["-c", "user.name=AgentFlow", "-c", "user.email=agentflow@example.invalid", "commit", "-m", "import baseline"], cwd);
}

async function gitChangedFiles(cwd: string): Promise<string[]> {
  const result = await run("git", ["status", "--short", "--untracked-files=all"], cwd);
  return result.stdout.split(/\r?\n/).map((line) => line.slice(3).trim()).filter(Boolean);
}

async function gitDiff(cwd: string): Promise<string> {
  return (await run("git", ["diff", "--"], cwd)).stdout;
}

async function gitChangedFileStatus(cwd: string): Promise<{ added: string[]; modified: string[]; deleted: string[] }> {
  const result = await run("git", ["diff", "--name-status", "--"], cwd);
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const [status, file] = line.split(/\s+/, 2);
    if (!status || !file) continue;
    if (status.startsWith("A")) added.push(file);
    else if (status.startsWith("D")) deleted.push(file);
    else modified.push(file);
  }
  return { added, modified, deleted };
}

async function runCommandString(command: string, cwd: string): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const [executable, ...args] = command.split(/\s+/).filter(Boolean);
  return run(executable, args, cwd);
}

async function run(command: string, args: string[], cwd: string): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
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
      resolveResult({ exitCode, stdout, stderr });
    });
  });
}
