import { createInitialContext } from "./core/context.ts";
import { NodeRegistry } from "./core/NodeRegistry.ts";
import { RepairPlanMaterializer } from "./core/repair/RepairPlanMaterializer.ts";
import { HumanApprovalRequestBuilder, RepairPlanBuilder } from "./core/repair/RepairPlanBuilder.ts";
import { TraceStore } from "./core/TraceStore.ts";
import type { WorkflowContext } from "./core/types.ts";
import { WorkflowGraph } from "./core/WorkflowGraph.ts";
import { WorkflowRuntime } from "./core/WorkflowRuntime.ts";
import { WorkflowTemplateRegistry } from "./core/WorkflowTemplateRegistry.ts";

const loaded = await new WorkflowTemplateRegistry().load("code-change-plan-execution-approval");
const context = materializedCodeChangePlanContext();
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
  approvalStatus: finalContext.codeChangePlanExecutionApprovalRequest?.status,
  requestedAction: finalContext.codeChangePlanExecutionApprovalRequest?.requestedAction,
  blockedUntilApproved: finalContext.codeChangePlanExecutionApprovalRequest?.blockedUntilApproved,
  requiresExplicitExecutionApproval: finalContext.codeChangePlanExecutionApprovalRequest?.requiresExplicitExecutionApproval,
  codeChangePlanHash: finalContext.codeChangePlanExecutionApprovalRequest?.codeChangePlanHash,
  operationsCount: finalContext.codeChangePlanExecutionApprovalRequest?.operationsCount,
  traceNodes: finalContext.trace.map((item) => item.nodeId),
  codeExecutorCalled: finalContext.trace.some((item) => item.nodeId === "codeExecutor"),
  summaryPath: traceStore.summaryPath,
  tracePath: traceStore.tracePath,
}, null, 2));

function materializedCodeChangePlanContext(): WorkflowContext {
  const context = createInitialContext({
    taskId: "code_change_execution_approval_demo",
    userGoal: "Create a pending execution approval request for a materialized CodeChangePlan.",
    successCriteria: ["Execution approval request is pending.", "No CodeExecutor is called."],
  });
  context.taskBrief = {
    taskId: "code_change_execution_approval_demo",
    goal: "Create a pending execution approval request for a materialized CodeChangePlan.",
    currentState: "A scoped repair plan has already been approved and materialized into a safe CodeChangePlan.",
    constraints: ["Do not write files.", "Do not run commands.", "Do not run tests.", "Do not call CodeExecutor."],
    resources: ["CodeChangePlan", "CodeChangePlanExecutionApprovalGate"],
    budget: "low",
    successCriteria: ["Execution approval request is pending.", "CodeChangePlan hash is recorded."],
    nonGoals: ["No CodeChangePlan execution.", "No automatic approval."],
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
  return context;
}
