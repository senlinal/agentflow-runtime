import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { createInitialContext } from "../core/context.ts";
import { ExecutionRecordStore } from "../core/execution/ExecutionRecordStore.ts";
import { NodeRegistry } from "../core/NodeRegistry.ts";
import { hashCodeChangePlan } from "../core/repair/CodeChangePlanHasher.ts";
import type { CodeChangePlan, TaskBrief, WorkflowContext } from "../core/types.ts";
import { WorkflowGraph } from "../core/WorkflowGraph.ts";
import { WorkflowRuntime } from "../core/WorkflowRuntime.ts";
import { WorkflowTemplateRegistry } from "../core/WorkflowTemplateRegistry.ts";

test("real project E2E fixes a copied fixture project and persists execution records", async () => {
  const fixtureDir = resolve("tests/fixtures/e2e-real-project");
  const originalCalculator = await readFile(join(fixtureDir, "src/calculator.ts"), "utf8");
  const originalStringUtils = await readFile(join(fixtureDir, "src/string-utils.ts"), "utf8");
  const taskBrief = JSON.parse(await readFile("inputs/e2e-real-project-fix-task.json", "utf8")) as TaskBrief;

  const workspace = await mkdtemp(join(tmpdir(), "agentflow-e2e-real-project-test-"));
  const recordStoreDir = await mkdtemp(join(tmpdir(), "agentflow-e2e-record-store-"));
  await cp(fixtureDir, workspace, { recursive: true });
  await initializeGit(workspace);

  const initialTest = await runProcess("npm", ["run", "test"], workspace);
  assert.notEqual(initialTest.exitCode, 0, "fixture should start with a failing calculator test");

  const loaded = await new WorkflowTemplateRegistry().load("code-change-plan-execution");
  loaded.config.nodes = loaded.config.nodes.map((node) => node.id === "codeChangePlanExecutionRunner"
    ? { ...node, executorConfig: { projectRoot: workspace, cwd: workspace, timeoutMs: 120000, executionRecordBaseDir: recordStoreDir } }
    : node);

  const finalContext = await new WorkflowRuntime(
    new WorkflowGraph(loaded.config),
    NodeRegistry.withDefaults(),
  ).run(buildContext(taskBrief));

  const finalTest = await runProcess("npm", ["run", "test"], workspace);
  const changedFiles = await gitChangedFiles(workspace);
  const record = finalContext.codeChangePlanExecutionRecord;
  assert.equal(finalTest.exitCode, 0, "tests should pass after controlled execution");
  assert.deepEqual(changedFiles, ["src/calculator.ts"]);
  assert.equal(await readFile(join(workspace, "src/string-utils.ts"), "utf8"), originalStringUtils);
  assert.equal(await readFile(join(fixtureDir, "src/calculator.ts"), "utf8"), originalCalculator);
  assert.equal(await readFile(join(fixtureDir, "src/string-utils.ts"), "utf8"), originalStringUtils);
  assert.equal(record?.status, "executed");
  assert.equal(record?.verification?.pass, true);
  assert.equal(record?.consumedApproval, true);
  assert.equal(record?.rollbackGuide?.destructiveRollbackPerformed, false);
  assert.ok(record?.executionRecordPath);
  assert.ok(record?.rollbackGuidePath);
  assert.ok(record?.checkpointId);
  assert.ok(!(record?.rollbackGuide?.changedFiles ?? []).some((file) => file.includes("deleted")));

  const stored = await new ExecutionRecordStore(recordStoreDir).get(record.executionId);
  assert.equal(stored.executionId, record.executionId);
  assert.equal(stored.verification?.pass, true);
  const guide = await new ExecutionRecordStore(recordStoreDir).getRollbackGuide(record.executionId);
  assert.equal(guide.destructiveRollbackPerformed, false);

  const show = await runProcess("node", ["--experimental-strip-types", "cli/execution-show.ts", "--id", record.executionId, "--baseDir", recordStoreDir], process.cwd());
  assert.equal(show.exitCode, 0);
  assert.match(show.stdout, new RegExp(record.executionId));
  assert.doesNotMatch(JSON.stringify(record), /\brm\b|sudo|curl.*\|\s*(sh|bash)|git reset --hard|git clean/);
});

function buildContext(input: TaskBrief): WorkflowContext {
  const context = createInitialContext({
    taskId: input.taskId,
    userGoal: input.goal,
    constraints: { allowedFiles: ["src/calculator.ts"], noDelete: true },
    successCriteria: input.successCriteria,
  });
  context.taskBrief = input;
  context.codingTaskContext = {
    allowedFiles: ["src/calculator.ts"],
    maxFilesChanged: 1,
    maxPatchSize: 12000,
    allowFileDelete: false,
    successCriteria: input.successCriteria,
  };
  const codeChangePlan: CodeChangePlan = {
    planId: `e2e_real_project_test_plan_${randomUUID().slice(0, 8)}`,
    repairPlanId: "e2e_real_project_repair_plan",
    approvalId: "e2e_real_project_repair_approval",
    status: "materialized",
    summary: "Fix calculator.add so the copied fixture project test suite passes.",
    operations: [
      {
        id: "op_fix_calculator_add",
        type: "modify_file",
        targetFile: "src/calculator.ts",
        content: [
          "export function add(a: number, b: number): number {",
          "  return a + b;",
          "}",
          "",
          "export function multiply(a: number, b: number): number {",
          "  return a * b;",
          "}",
          "",
        ].join("\n"),
        description: "Replace the subtracting add implementation with addition.",
        reason: "The failing calculator tests require add(1, 2) to equal 3.",
        safetyConstraints: ["Only modify src/calculator.ts.", "Do not delete files."],
      },
      {
        id: "op_run_npm_test",
        type: "run_test",
        command: "npm run test",
        description: "Run the fixture test suite.",
        reason: "Verify calculator and string-utils behavior after the change.",
        safetyConstraints: ["Use configured test command only."],
      },
    ],
    targetFiles: ["src/calculator.ts"],
    forbiddenFiles: ["src/string-utils.ts", ".env", ".env.local"],
    testCommands: ["npm run test"],
    riskLevel: "low",
    safetyChecks: ["hash-bound approval", "single allowed target file", "configured test command only"],
    blockedOperations: [],
    executable: false,
    requiresExplicitExecutionApproval: true,
    createdAt: new Date().toISOString(),
  };
  context.codeChangePlan = codeChangePlan;
  context.codeChangePlanExecutionApprovalRecord = {
    approvalId: `e2e_real_project_execution_approval_${randomUUID().slice(0, 8)}`,
    codeChangePlanId: codeChangePlan.planId,
    codeChangePlanHash: hashCodeChangePlan(codeChangePlan),
    status: "approved",
    requestedAction: "approve_code_change_plan_execution",
    approvedAt: new Date().toISOString(),
    approvedBy: "test",
    note: "Approved only for the copied E2E fixture workspace.",
  };
  context.runtimeMetadata = {
    executionVerification: {
      allowedFiles: ["src/calculator.ts"],
      maxFilesChanged: 1,
      maxPatchSize: 12000,
    },
  };
  return context;
}

async function initializeGit(cwd: string): Promise<void> {
  await runProcess("git", ["init"], cwd);
  await runProcess("git", ["add", "."], cwd);
  await runProcess("git", ["-c", "user.name=AgentFlow", "-c", "user.email=agentflow@example.invalid", "commit", "-m", "fixture baseline"], cwd);
}

async function gitChangedFiles(cwd: string): Promise<string[]> {
  const result = await runProcess("git", ["status", "--short", "--untracked-files=all"], cwd);
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

async function runProcess(command: string, args: string[], cwd: string): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
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
