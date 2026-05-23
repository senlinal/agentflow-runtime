import { createInitialContext } from "./core/context.ts";
import { NodeRegistry } from "./core/NodeRegistry.ts";
import { CodeChangePlanExecutionApprovalGate } from "./core/repair/CodeChangePlanExecutionApprovalExecutor.ts";
import { RepairPlanMaterializer } from "./core/repair/RepairPlanMaterializer.ts";
import { HumanApprovalRequestBuilder, RepairPlanBuilder } from "./core/repair/RepairPlanBuilder.ts";
import { TraceStore } from "./core/TraceStore.ts";
import type { WorkflowContext } from "./core/types.ts";
import { WorkflowGraph } from "./core/WorkflowGraph.ts";
import { WorkflowRuntime } from "./core/WorkflowRuntime.ts";
import { WorkflowTemplateRegistry } from "./core/WorkflowTemplateRegistry.ts";

const loaded = await new WorkflowTemplateRegistry().load("code-change-plan-execution-dry-run");
const context = approvedExecutionApprovalContext();
const originalApprovalStatus = context.codeChangePlanExecutionApprovalRecord?.status;
const finalContext = await new WorkflowRuntime(
  new WorkflowGraph(loaded.config),
  NodeRegistry.withDefaults(),
).run(context);
const traceStore = await TraceStore.save(finalContext, {
  workflowName: loaded.config.workflow.name,
  templateVersion: loaded.config.workflow.version,
});

console.log(JSON.stringify({
  workflow: loaded.config.workflow.name,
  approvalStatus: finalContext.codeChangePlanDryRunExecutionPlan?.approvalStatus,
  hashMatched: finalContext.codeChangePlanDryRunExecutionPlan?.hashMatched,
  dryRunStatus: finalContext.codeChangePlanDryRunExecutionPlan?.status,
  mode: finalContext.codeChangePlanDryRunExecutionPlan?.mode,
  codeChangePlanHash: finalContext.codeChangePlanDryRunExecutionPlan?.codeChangePlanHash,
  wouldWriteFiles: finalContext.codeChangePlanDryRunExecutionPlan?.wouldWriteFiles,
  wouldRunCommands: finalContext.codeChangePlanDryRunExecutionPlan?.wouldRunCommands,
  wouldRunTests: finalContext.codeChangePlanDryRunExecutionPlan?.wouldRunTests,
  wouldCallCodeExecutor: finalContext.codeChangePlanDryRunExecutionPlan?.wouldCallCodeExecutor,
  consumesApproval: finalContext.codeChangePlanDryRunExecutionPlan?.consumesApproval,
  approvalConsumed: finalContext.codeChangePlanDryRunExecutionPlan?.consumesApproval,
  requiresExecuteFlag: finalContext.codeChangePlanDryRunExecutionPlan?.requiresExecuteFlag,
  approvalStatusBefore: originalApprovalStatus,
  approvalStatusAfter: finalContext.codeChangePlanExecutionApprovalRecord?.status,
  operationsCount: finalContext.codeChangePlanDryRunExecutionPlan?.operations.length,
  traceNodes: finalContext.trace.map((item) => item.nodeId),
  codeExecutorCalled: finalContext.trace.some((item) => item.nodeId === "codeExecutor"),
  summaryPath: traceStore.summaryPath,
  tracePath: traceStore.tracePath,
}, null, 2));

function approvedExecutionApprovalContext(): WorkflowContext {
  const context = createInitialContext({
    taskId: "code_change_execution_dry_run_demo",
    userGoal: "Create a dry-run execution plan for an approved CodeChangePlan.",
    successCriteria: ["Dry-run execution plan is created.", "No execution happens.", "Approval remains approved."],
  });
  context.taskBrief = {
    taskId: "code_change_execution_dry_run_demo",
    goal: "Create a dry-run execution plan for an approved CodeChangePlan.",
    currentState: "A CodeChangePlan execution approval request has been reviewed and approved.",
    constraints: ["Do not write files.", "Do not run commands.", "Do not run tests.", "Do not call CodeExecutor.", "Do not consume approval."],
    resources: ["CodeChangePlan", "CodeChangePlanExecutionApprovalRecord", "CodeChangePlanDryRunRunner"],
    budget: "low",
    successCriteria: ["Dry-run plan is created.", "CodeChangePlan hash is verified."],
    nonGoals: ["No CodeChangePlan execution.", "No approval consumption."],
  };
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
  context.humanApprovalRequest = new HumanApprovalRequestBuilder().build(context.scopedRepairPlan);
  context.repairApprovalRecord = {
    approvalId: context.humanApprovalRequest.approvalId,
    repairPlanId: context.scopedRepairPlan.planId,
    status: "approved",
    approvedAt: new Date().toISOString(),
    approvedBy: "user",
    note: "Approved for CodeChangePlan materialization only.",
  };
  context.codeChangePlan = new RepairPlanMaterializer().materialize(context);
  context.codeChangePlanExecutionApprovalRequest = new CodeChangePlanExecutionApprovalGate().build(context.codeChangePlan);
  context.codeChangePlanExecutionApprovalRecord = {
    approvalId: context.codeChangePlanExecutionApprovalRequest.approvalId,
    codeChangePlanId: context.codeChangePlanExecutionApprovalRequest.codeChangePlanId,
    codeChangePlanHash: context.codeChangePlanExecutionApprovalRequest.codeChangePlanHash,
    status: "approved",
    requestedAction: "approve_code_change_plan_execution",
    approvedAt: new Date().toISOString(),
    approvedBy: "user",
    note: "Approved for dry-run planning only.",
  };
  return context;
}
