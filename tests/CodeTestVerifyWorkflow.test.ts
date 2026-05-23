import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import { createInitialContext } from "../core/context.ts";
import { NodeRegistry } from "../core/NodeRegistry.ts";
import { RepairPlanMaterializer } from "../core/repair/RepairPlanMaterializer.ts";
import { HumanApprovalRequestBuilder, RepairPlanBuilder } from "../core/repair/RepairPlanBuilder.ts";
import { TraceStore } from "../core/TraceStore.ts";
import { WorkflowRunner } from "../core/WorkflowRunner.ts";
import { WorkflowGraph } from "../core/WorkflowGraph.ts";
import { WorkflowRuntime } from "../core/WorkflowRuntime.ts";
import { WorkflowTemplateRegistry } from "../core/WorkflowTemplateRegistry.ts";
import type { AgentNode, TaskBrief, WorkflowContext, WorkflowGraphConfig } from "../core/types.ts";

const execFileAsync = promisify(execFile);

describe("code-test-verify workflow", () => {
  it("validates the formal workflow template", async () => {
    const loaded = await new WorkflowTemplateRegistry().load("code-test-verify");

    assert.equal(loaded.config.workflow.name, "code-test-verify");
    assert.deepEqual(loaded.config.nodes.map((node) => node.type), ["code", "test", "verify", "repair", "approval"]);
    assert.equal(loaded.config.nodes[0].outputSchema, "CodeExecutionResult");
    assert.equal(loaded.config.nodes[1].outputSchema, "TestExecutionResult");
    assert.equal(loaded.config.nodes[2].outputSchema, "VerificationReport");
    assert.equal(loaded.config.nodes[3].outputSchema, "ScopedRepairPlan");
    assert.equal(loaded.config.nodes[4].outputSchema, "HumanApprovalRequest");
  });

  it("runs code -> test -> verify in a temporary fixture workspace", async () => {
    const workspace = await createFixtureWorkspace();
    const loaded = await new WorkflowTemplateRegistry().load("code-test-verify");
    const config = withFixtureExecutorConfig(loaded.config, workspace);

    const result = await new WorkflowRunner().run(config, taskBrief());
    const nodeIds = result.trace.map((item) => item.nodeId);
    const summary = await readFile(result.summaryPath, "utf8");

    assert.deepEqual(nodeIds, ["codeExecutor", "testRunner", "verifier"]);
    assert.ok(result.context.codeExecutionResult);
    assert.ok(result.context.testExecutionResult);
    assert.ok(result.context.verification);
    assert.ok(result.context.codeExecutionResult.artifacts.includes("src/generated.txt"));
    assert.match(result.context.codeExecutionResult.rawOutput, /checkpoint_/);
    assert.match(result.context.codeExecutionResult.rawOutput, /src\/generated\.txt/);
    assert.match(result.context.testExecutionResult.rawOutput, /fixture-ok/);
    assert.equal(result.context.verification.pass, true);
    assert.ok(result.context.verification.evidence);
    assert.deepEqual(result.context.verification.failureCodes, []);
    assert.match(summary, /codeExecutionResult/);
    assert.match(summary, /testExecutionResult/);
    assert.match(summary, /Execution Verification Evidence/);
  });

  it("returns pass=false when the configured test command fails", async () => {
    const workspace = await createFixtureWorkspace();
    const loaded = await new WorkflowTemplateRegistry().load("code-test-verify");
    const config = withFixtureExecutorConfig(loaded.config, workspace, {}, {
      commands: ["node -e \"process.exit(1)\""],
    });

    const result = await new WorkflowRunner().run(config, taskBrief());
    const summary = await readFile(result.summaryPath, "utf8");

    assert.deepEqual(result.trace.map((item) => item.nodeId), [
      "codeExecutor",
      "testRunner",
      "verifier",
      "repairPlanBuilder",
      "humanApprovalGate",
    ]);
    assert.equal(result.context.verification?.pass, false);
    assert.ok(result.context.verification?.failureCodes?.includes("test_failed"));
    assert.ok(result.context.scopedRepairPlan?.basedOnFailureCodes.includes("test_failed"));
    assert.equal(result.context.scopedRepairPlan?.requiresHumanApproval, true);
    assert.equal(result.context.humanApprovalRequest?.status, "pending");
    assert.equal(result.context.humanApprovalRequest?.blockedUntilApproved, true);
    assert.equal(result.trace.filter((item) => item.nodeId === "codeExecutor").length, 1);
    assert.match(summary, /Scoped Repair \/ Approval/);
    assert.match(summary, /No repair was executed automatically/);
    assert.match(summary, /Human approval is required before applying any repair/);
  });

  it("returns pass=false when a code operation is blocked", async () => {
    const workspace = await createFixtureWorkspace();
    const loaded = await new WorkflowTemplateRegistry().load("code-test-verify");
    const config = withFixtureExecutorConfig(loaded.config, workspace, {
      fileWrites: [{ path: "../outside.txt", content: "nope\n" }],
      commands: [],
    });

    const result = await new WorkflowRunner().run(config, taskBrief());

    assert.equal(result.context.verification?.pass, false);
    assert.ok(result.context.verification?.failureCodes?.includes("code_execution_failed"));
    assert.ok(result.context.verification?.failureCodes?.includes("operation_blocked"));
    assert.ok(result.context.scopedRepairPlan);
    assert.equal(result.context.humanApprovalRequest?.requestedAction, "approve_scoped_repair_plan");
  });

  it("stops with a structured code execution error when diff limits are exceeded", async () => {
    const workspace = await createFixtureWorkspace();
    const loaded = await new WorkflowTemplateRegistry().load("code-test-verify");
    const config = withFixtureExecutorConfig(loaded.config, workspace, { maxFilesChanged: 0 });

    const result = await new WorkflowRunner().run(config, taskBrief());

    assert.match(result.context.codeExecutionResult?.errors.join("\n") ?? "", /maxFilesChanged/);
    assert.equal(result.trace[0].nodeId, "codeExecutor");
  });

  it("materializes an approved repair plan into a safe CodeChangePlan without execution", async () => {
    const loaded = await new WorkflowTemplateRegistry().load("approved-repair-materialize");
    const context = approvedRepairContext();

    const finalContext = await new WorkflowRuntime(
      new WorkflowGraph(loaded.config),
      NodeRegistry.withDefaults(),
    ).run(context);
    const traceStore = await TraceStore.save(finalContext, {
      workflowName: loaded.config.workflow.name,
      templateVersion: loaded.config.workflow.version,
      baseDir: await mkdtemp(join(tmpdir(), "agentflow-materialize-run-")),
    });
    const summary = await readFile(traceStore.summaryPath, "utf8");

    assert.deepEqual(finalContext.trace.map((item) => item.nodeId), ["repairPlanMaterializer"]);
    assert.equal(finalContext.codeChangePlan?.status, "materialized");
    assert.equal(finalContext.codeChangePlan?.executable, false);
    assert.equal(finalContext.codeChangePlan?.requiresExplicitExecutionApproval, true);
    assert.equal(finalContext.trace.some((item) => item.nodeId === "codeExecutor"), false);
    assert.match(summary, /CodeChangePlan Summary/);
    assert.match(summary, /codeChangePlanStatus: materialized/);
    assert.match(summary, /Materialized code change plans are not executed automatically/);
    assert.match(summary, /CodeChangePlan was materialized only/);
    assert.match(summary, /Explicit execution approval is required before applying this plan/);
  });

  it("creates a pending CodeChangePlan execution approval request without execution", async () => {
    const loaded = await new WorkflowTemplateRegistry().load("code-change-plan-execution-approval");
    const context = approvedRepairContext();
    context.codeChangePlan = new RepairPlanMaterializer().materialize(context, new Date("2026-05-23T00:00:00.000Z"));

    const finalContext = await new WorkflowRuntime(
      new WorkflowGraph(loaded.config),
      NodeRegistry.withDefaults(),
    ).run(context);
    const traceStore = await TraceStore.save(finalContext, {
      workflowName: loaded.config.workflow.name,
      templateVersion: loaded.config.workflow.version,
      baseDir: await mkdtemp(join(tmpdir(), "agentflow-execution-approval-run-")),
    });
    const summary = await readFile(traceStore.summaryPath, "utf8");

    assert.deepEqual(finalContext.trace.map((item) => item.nodeId), ["codeChangePlanExecutionApprovalGate"]);
    assert.equal(finalContext.codeChangePlanExecutionApprovalRequest?.status, "pending");
    assert.equal(finalContext.codeChangePlanExecutionApprovalRequest?.requestedAction, "approve_code_change_plan_execution");
    assert.equal(finalContext.codeChangePlanExecutionApprovalRequest?.blockedUntilApproved, true);
    assert.equal(finalContext.codeChangePlanExecutionApprovalRequest?.requiresExplicitExecutionApproval, true);
    assert.match(finalContext.codeChangePlanExecutionApprovalRequest?.codeChangePlanHash ?? "", /^sha256:/);
    assert.equal(finalContext.trace.some((item) => item.nodeId === "codeExecutor"), false);
    assert.match(summary, /CodeChangePlan Execution Approval/);
    assert.match(summary, /No CodeChangePlan operations were executed automatically/);
    assert.match(summary, /Pending execution approval is not an execution authorization/);
  });
});

function withFixtureExecutorConfig(
  config: WorkflowGraphConfig,
  workspace: string,
  overrides: Record<string, unknown> = {},
  testOverrides: Record<string, unknown> = {},
): WorkflowGraphConfig {
  const nodes = config.nodes.map((node): AgentNode => {
    if (node.id === "codeExecutor") {
      return {
        ...node,
        executorConfig: {
          ...node.executorConfig,
          projectRoot: workspace,
          cwd: workspace,
          fileWrites: [{ path: "src/generated.txt", content: "fixture-ok\n" }],
          commands: ["node -e \"console.log('code-step-ok')\""],
          ...overrides,
        },
      };
    }
    if (node.id === "testRunner") {
      return {
        ...node,
        executorConfig: {
          ...node.executorConfig,
          projectRoot: workspace,
          cwd: workspace,
          commands: [
            "node -e \"require('fs').existsSync('src/generated.txt') ? console.log('fixture-ok') : process.exit(1)\"",
          ],
          ...testOverrides,
        },
      };
    }
    return node;
  });
  return { ...config, nodes };
}

async function createFixtureWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "agentflow-code-test-"));
  await execFileAsync("git", ["init"], { cwd: workspace });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: workspace });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: workspace });
  await writeFile(join(workspace, "README.md"), "# fixture\n", "utf8");
  await execFileAsync("git", ["add", "README.md"], { cwd: workspace });
  await execFileAsync("git", ["commit", "-m", "init"], { cwd: workspace });
  return workspace;
}

function taskBrief(): TaskBrief {
  return {
    taskId: "code_test_verify_fixture",
    goal: "Create a fixture file, run a fixture test, and verify the controlled execution trace.",
    currentState: "Temporary fixture workspace with a clean git repository.",
    constraints: ["Use only declared file writes.", "Use only allowlisted local commands."],
    resources: ["CodeExecutor", "TestRunner", "WorkflowRunner"],
    budget: "low",
    successCriteria: ["Generated file exists.", "Fixture test command passes.", "Trace and summary are written."],
    nonGoals: ["Do not call real LLM providers.", "Do not run arbitrary shell commands."],
  };
}

function approvedRepairContext(): WorkflowContext {
  const context = createInitialContext({
    taskId: "approved_repair_fixture",
    userGoal: "Materialize an approved repair plan.",
    successCriteria: ["CodeChangePlan is created.", "No execution happens."],
  });
  context.taskBrief = taskBrief();
  context.codingTaskContext = {
    allowedFiles: ["src/generated.txt"],
    maxFilesChanged: 3,
    maxPatchSize: 20000,
  };
  context.testExecutionResult = {
    status: "failed",
    completedSteps: ["Ran npm run test"],
    artifacts: [],
    summary: "tests failed",
    errors: ["npm run test exited with 1."],
    rawOutput: JSON.stringify({
      passed: false,
      commands: [{ command: "npm", args: ["run", "test"], exitCode: 1 }],
    }),
  };
  context.verification = {
    pass: false,
    score: 0.5,
    failedCriteria: ["test_failed: One or more configured test commands failed."],
    reason: "Execution verification failed.",
    nextAction: "retry_execute",
    feedbackToPlanner: "Fix failed tests.",
    failureCodes: ["test_failed"],
    evidence: {
      filesChanged: ["src/generated.txt"],
      filesAdded: ["src/generated.txt"],
      filesModified: [],
      filesDeleted: [],
      failedCommands: ["npm run test"],
      safetyFindings: [],
    },
    safetyFindings: [],
    recommendedFixes: ["Fix the failing test."],
  };
  context.scopedRepairPlan = new RepairPlanBuilder().build(context);
  context.humanApprovalRequest = new HumanApprovalRequestBuilder().build(context.scopedRepairPlan, new Date("2026-05-23T00:00:00.000Z"));
  context.repairApprovalRecord = {
    approvalId: context.humanApprovalRequest.approvalId,
    repairPlanId: context.scopedRepairPlan.planId,
    status: "approved",
    approvedAt: "2026-05-23T00:01:00.000Z",
    approvedBy: "user",
    note: "Approved for materialization only.",
  };
  return context;
}
