import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createInitialContext } from "./core/context.ts";
import { NodeRegistry } from "./core/NodeRegistry.ts";
import { hashCodeChangePlan } from "./core/repair/CodeChangePlanHasher.ts";
import { TraceStore } from "./core/TraceStore.ts";
import type { CodeChangePlan, WorkflowContext } from "./core/types.ts";
import { WorkflowGraph } from "./core/WorkflowGraph.ts";
import { WorkflowRuntime } from "./core/WorkflowRuntime.ts";
import { WorkflowTemplateRegistry } from "./core/WorkflowTemplateRegistry.ts";

const workspace = await mkdtemp(join(tmpdir(), "agentflow-code-change-execution-"));
await mkdir(join(workspace, "src"), { recursive: true });
await writeFile(join(workspace, "package.json"), JSON.stringify({
  scripts: {
    test: "node -e \"const fs=require('fs'); const text=fs.readFileSync('src/generated.txt','utf8'); if(!text.includes('approved execution')) process.exit(1);\"",
  },
}, null, 2), "utf8");

const loaded = await new WorkflowTemplateRegistry().load("code-change-plan-execution");
loaded.config.nodes = loaded.config.nodes.map((node) => node.id === "codeChangePlanExecutionRunner"
  ? { ...node, executorConfig: { projectRoot: workspace, cwd: workspace, timeoutMs: 120000 } }
  : node);
const context = approvedExecutionContext(workspace);
const originalApprovalStatus = context.codeChangePlanExecutionApprovalRecord?.status;
const finalContext = await new WorkflowRuntime(
  new WorkflowGraph(loaded.config),
  NodeRegistry.withDefaults(),
).run(context);
const traceStore = await TraceStore.save(finalContext, {
  workflowName: loaded.config.workflow.name,
  templateVersion: loaded.config.workflow.version,
});
const writtenContent = await readFile(join(workspace, "src/generated.txt"), "utf8");

console.log(JSON.stringify({
  workflow: loaded.config.workflow.name,
  executionStatus: finalContext.codeChangePlanExecutionRecord?.status,
  consumedApproval: finalContext.codeChangePlanExecutionRecord?.consumedApproval,
  approvalStatusBefore: originalApprovalStatus,
  approvalStatusAfter: finalContext.codeChangePlanExecutionApprovalRecord?.status,
  consumedByExecutionId: finalContext.codeChangePlanExecutionApprovalRecord?.consumedByExecutionId,
  checkpointId: finalContext.codeChangePlanExecutionRecord?.checkpointId,
  codeStatus: finalContext.codeExecutionResult?.status,
  testStatus: finalContext.testExecutionResult?.status,
  verificationPass: finalContext.verification?.pass,
  rollbackGuideCreated: Boolean(finalContext.codeChangePlanExecutionRecord?.rollbackGuide),
  destructiveRollbackPerformed: finalContext.codeChangePlanExecutionRecord?.rollbackGuide?.destructiveRollbackPerformed,
  wroteExpectedFile: writtenContent.includes("approved execution"),
  traceNodes: finalContext.trace.map((item) => item.nodeId),
  summaryPath: traceStore.summaryPath,
  tracePath: traceStore.tracePath,
}, null, 2));

function approvedExecutionContext(projectRoot: string): WorkflowContext {
  const context = createInitialContext({
    taskId: "code_change_execution_demo",
    userGoal: "Explicitly execute an approved CodeChangePlan.",
    successCriteria: ["Configured test command passes."],
  });
  context.taskBrief = {
    taskId: "code_change_execution_demo",
    goal: "Explicitly execute an approved CodeChangePlan.",
    currentState: "A CodeChangePlan has explicit execution approval.",
    constraints: ["Do not delete files.", "Do not run high-risk shell.", "Run tests after execution."],
    resources: ["CodeChangePlan", "CodeChangePlanExecutionApprovalRecord", "CodeExecutor", "TestRunner"],
    budget: "low",
    successCriteria: ["Configured test command passes."],
    nonGoals: ["No destructive rollback.", "No automatic approval."],
  };
  context.codingTaskContext = {
    allowedFiles: ["src/generated.txt"],
    maxFilesChanged: 2,
    maxPatchSize: 20000,
    allowFileDelete: false,
    successCriteria: ["Configured test command passes."],
  };
  const codeChangePlan: CodeChangePlan = {
    planId: "code_change_execution_demo_plan",
    repairPlanId: "repair_execution_demo",
    approvalId: "repair_approval_execution_demo",
    status: "materialized",
    summary: "Create a small generated fixture file and run the configured test command.",
    operations: [
      {
        id: "op_create_generated",
        type: "create_file",
        targetFile: "src/generated.txt",
        content: "approved execution\n",
        description: "Create generated fixture file.",
        reason: "Satisfy success criteria.",
        safetyConstraints: ["No delete.", "Scoped target file only."],
      },
      {
        id: "op_test_generated",
        type: "run_test",
        command: "npm run test",
        description: "Run scoped test command.",
        reason: "Verify generated file content.",
        safetyConstraints: ["Only configured test command."],
      },
    ],
    targetFiles: ["src/generated.txt"],
    forbiddenFiles: [".env", ".env.local"],
    testCommands: ["npm run test"],
    riskLevel: "low",
    safetyChecks: ["target file is scoped", "test command is scoped"],
    blockedOperations: [],
    executable: false,
    requiresExplicitExecutionApproval: true,
    createdAt: "2026-05-23T00:00:00.000Z",
  };
  context.codeChangePlan = codeChangePlan;
  context.codeChangePlanExecutionApprovalRecord = {
    approvalId: "exec_approval_execution_demo",
    codeChangePlanId: codeChangePlan.planId,
    codeChangePlanHash: hashCodeChangePlan(codeChangePlan),
    status: "approved",
    requestedAction: "approve_code_change_plan_execution",
    approvedAt: "2026-05-23T00:01:00.000Z",
    approvedBy: "demo",
    note: "Approved for explicit controlled execution demo.",
  };
  context.runtimeMetadata = {
    executionVerification: {
      maxFilesChanged: 2,
      maxPatchSize: 20000,
    },
  };
  return context;
}
