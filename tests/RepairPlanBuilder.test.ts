import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialContext } from "../core/context.ts";
import { HumanApprovalExecutor } from "../core/repair/HumanApprovalExecutor.ts";
import { HumanApprovalRequestBuilder, RepairPlanBuilder } from "../core/repair/RepairPlanBuilder.ts";
import { SchemaValidator } from "../core/SchemaValidator.ts";
import type { WorkflowContext } from "../core/types.ts";

describe("RepairPlanBuilder", () => {
  it("builds a scoped repair plan from failed verification evidence", () => {
    const plan = new RepairPlanBuilder().build(failedContext());

    assert.equal(plan.requiresHumanApproval, true);
    assert.ok(plan.basedOnFailureCodes.includes("test_failed"));
    assert.deepEqual(plan.targetFiles, ["src/generated.txt"]);
    assert.ok(plan.forbiddenFiles.includes(".env"));
    assert.ok(plan.proposedOperations.some((operation) => operation.type === "modify_file"));
    assert.ok(plan.proposedOperations.some((operation) => operation.type === "run_test"));
    assert.ok(!plan.proposedOperations.some((operation) => operation.type === "delete_file" as never));
    assert.equal(SchemaValidator.validate("ScopedRepairPlan", plan), plan);
  });

  it("marks unsafe or blocked repairs as high risk", () => {
    const context = failedContext();
    context.verification!.failureCodes = ["operation_blocked", "unsafe_file_touched"];
    context.verification!.evidence = {
      filesChanged: [".env"],
      safetyFindings: [".env"],
      filesDeleted: [],
      failedCommands: ["npm run test"],
    };

    const plan = new RepairPlanBuilder().build(context);

    assert.equal(plan.riskLevel, "high");
    assert.ok(!plan.targetFiles.includes(".env"));
    assert.ok(plan.forbiddenFiles.includes(".env"));
  });

  it("refuses to build when verification is missing or passed", () => {
    const context = failedContext();
    context.verification = { ...context.verification!, pass: true };

    assert.throws(() => new RepairPlanBuilder().build(context), /failed VerificationReport/);
  });
});

describe("HumanApprovalRequestBuilder", () => {
  it("creates a pending approval request without executing repair", () => {
    const plan = new RepairPlanBuilder().build(failedContext());
    const request = new HumanApprovalRequestBuilder().build(plan, new Date("2026-05-23T00:00:00.000Z"));

    assert.equal(request.status, "pending");
    assert.equal(request.repairPlanId, plan.planId);
    assert.equal(request.blockedUntilApproved, true);
    assert.equal(request.requestedAction, "approve_scoped_repair_plan");
    assert.equal(SchemaValidator.validate("HumanApprovalRequest", request), request);
  });

  it("HumanApprovalExecutor returns pending approval and does not approve or execute repair", async () => {
    const context = failedContext();
    context.scopedRepairPlan = new RepairPlanBuilder().build(context);

    const request = await new HumanApprovalExecutor().execute({
      id: "humanApprovalGate",
      type: "approval",
      role: "HumanApprovalGate",
      description: "approval",
      inputKeys: ["scopedRepairPlan"],
      outputKey: "humanApprovalRequest",
      outputSchema: "HumanApprovalRequest",
    }, context);

    const approval = SchemaValidator.validate("HumanApprovalRequest", request) as typeof context.humanApprovalRequest;
    assert.equal(approval?.status, "pending");
    assert.equal(approval?.blockedUntilApproved, true);
    assert.equal(approval?.requestedAction, "approve_scoped_repair_plan");
  });
});

function failedContext(): WorkflowContext {
  const context = createInitialContext({
    taskId: "repair-test",
    userGoal: "repair failed execution",
    successCriteria: ["Fixture test command passes."],
  });
  return {
    ...context,
    taskBrief: {
      taskId: "repair-test",
      goal: "repair failed execution",
      currentState: "test fixture",
      constraints: ["Do not delete files."],
      resources: ["CodeExecutor", "TestRunner"],
      budget: "low",
      successCriteria: ["Fixture test command passes."],
      nonGoals: ["No automatic repair execution."],
    },
    codingTaskContext: {
      allowedFiles: ["src/generated.txt"],
      maxFilesChanged: 3,
      maxPatchSize: 20000,
    },
    testExecutionResult: {
      status: "failed",
      completedSteps: ["Ran npm run test"],
      artifacts: [],
      summary: "tests failed",
      errors: ["npm run test exited with 1."],
      rawOutput: JSON.stringify({
        passed: false,
        commands: [{ command: "npm", args: ["run", "test"], exitCode: 1 }],
      }),
    },
    verification: {
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
    },
  };
}
