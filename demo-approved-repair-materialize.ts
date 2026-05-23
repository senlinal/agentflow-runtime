import { createInitialContext } from "./core/context.ts";
import { NodeRegistry } from "./core/NodeRegistry.ts";
import { HumanApprovalRequestBuilder, RepairPlanBuilder } from "./core/repair/RepairPlanBuilder.ts";
import { TraceStore } from "./core/TraceStore.ts";
import type { WorkflowContext } from "./core/types.ts";
import { WorkflowGraph } from "./core/WorkflowGraph.ts";
import { WorkflowRuntime } from "./core/WorkflowRuntime.ts";
import { WorkflowTemplateRegistry } from "./core/WorkflowTemplateRegistry.ts";

const loaded = await new WorkflowTemplateRegistry().load("approved-repair-materialize");
const context = approvedRepairContext();
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
  approvalStatus: finalContext.repairApprovalRecord?.status,
  codeChangePlanStatus: finalContext.codeChangePlan?.status,
  executable: finalContext.codeChangePlan?.executable,
  requiresExplicitExecutionApproval: finalContext.codeChangePlan?.requiresExplicitExecutionApproval,
  operations: finalContext.codeChangePlan?.operations.map((operation) => `${operation.id}:${operation.type}`) ?? [],
  traceNodes: finalContext.trace.map((item) => item.nodeId),
  summaryPath: traceStore.summaryPath,
  tracePath: traceStore.tracePath,
}, null, 2));

function approvedRepairContext(): WorkflowContext {
  const context = createInitialContext({
    taskId: "approved_repair_demo",
    userGoal: "Materialize an approved scoped repair plan into a safe CodeChangePlan.",
    successCriteria: ["CodeChangePlan is created.", "No code execution happens."],
  });
  context.taskBrief = {
    taskId: "approved_repair_demo",
    goal: "Materialize an approved scoped repair plan into a safe CodeChangePlan.",
    currentState: "Verifier failed in a previous controlled execution run.",
    constraints: ["Do not write files.", "Do not run commands.", "Do not call CodeExecutor."],
    resources: ["ScopedRepairPlan", "HumanApprovalRequest", "RepairApprovalRecord"],
    budget: "low",
    successCriteria: ["CodeChangePlan is created.", "No code execution happens."],
    nonGoals: ["No automatic repair execution.", "No test execution."],
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
  return context;
}
