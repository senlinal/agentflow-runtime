import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialContext } from "../core/context.ts";
import { HumanApprovalExecutor } from "../core/repair/HumanApprovalExecutor.ts";
import { HumanApprovalRequestBuilder, RepairPlanBuilder } from "../core/repair/RepairPlanBuilder.ts";
import { RepairPlanMaterializer } from "../core/repair/RepairPlanMaterializer.ts";
import { RepairPlanMaterializerExecutor } from "../core/repair/RepairPlanMaterializerExecutor.ts";
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

describe("RepairPlanMaterializer", () => {
  it("materializes an approved repair plan into a non-executable CodeChangePlan", () => {
    const context = approvedContext();
    const plan = new RepairPlanMaterializer().materialize(context, new Date("2026-05-23T00:00:00.000Z"));

    assert.equal(plan.status, "materialized");
    assert.equal(plan.executable, false);
    assert.equal(plan.requiresExplicitExecutionApproval, true);
    assert.equal(plan.repairPlanId, context.scopedRepairPlan?.planId);
    assert.equal(plan.approvalId, context.repairApprovalRecord?.approvalId);
    assert.ok(plan.operations.some((operation) => operation.type === "modify_file"));
    assert.ok(!plan.operations.some((operation) => operation.type === "delete_file" as never));
    assert.deepEqual(plan.blockedOperations, []);
    assert.equal(SchemaValidator.validate("CodeChangePlan", plan), plan);
  });

  it("refuses pending, rejected, expired, and mismatched approvals", () => {
    for (const status of ["pending", "rejected", "consumed"] as const) {
      const context = approvedContext();
      context.repairApprovalRecord = { ...context.repairApprovalRecord!, status };
      assert.throws(() => new RepairPlanMaterializer().materialize(context), /must be approved/);
    }

    const expired = approvedContext();
    expired.repairApprovalRecord!.expiresAt = "2020-01-01T00:00:00.000Z";
    assert.throws(() => new RepairPlanMaterializer().materialize(expired), /expired/);

    const mismatched = approvedContext();
    mismatched.repairApprovalRecord!.repairPlanId = "repair_other";
    assert.throws(() => new RepairPlanMaterializer().materialize(mismatched), /does not match/);
  });

  it("refuses scope expansion, forbidden files, delete operations, and high-risk commands", () => {
    const outsideTarget = approvedContext();
    outsideTarget.scopedRepairPlan!.proposedOperations[1] = {
      ...outsideTarget.scopedRepairPlan!.proposedOperations[1],
      targetFile: "src/other.txt",
    };
    assert.throws(() => new RepairPlanMaterializer().materialize(outsideTarget), /outside scoped targetFiles/);

    const forbidden = approvedContext();
    forbidden.scopedRepairPlan!.proposedOperations[1] = {
      ...forbidden.scopedRepairPlan!.proposedOperations[1],
      targetFile: ".env",
    };
    forbidden.scopedRepairPlan!.targetFiles = [".env"];
    assert.throws(() => new RepairPlanMaterializer().materialize(forbidden), /forbidden or sensitive/);

    const deleting = approvedContext();
    deleting.scopedRepairPlan!.proposedOperations.push({
      id: "delete",
      type: "delete_file" as never,
      targetFile: "src/generated.txt",
      description: "delete",
      reason: "unsafe",
      safetyConstraints: [],
    });
    assert.throws(() => new RepairPlanMaterializer().materialize(deleting), /delete_file is not supported/);

    const riskyCommand = approvedContext();
    riskyCommand.scopedRepairPlan!.testCommands = ["rm -rf src"];
    riskyCommand.scopedRepairPlan!.proposedOperations.push({
      id: "risky_command",
      type: "run_test",
      command: "rm -rf src",
      description: "risky command",
      reason: "unsafe",
      safetyConstraints: [],
    });
    assert.throws(() => new RepairPlanMaterializer().materialize(riskyCommand), /high risk/);
  });

  it("RepairPlanMaterializerExecutor returns a CodeChangePlan without executing repair", async () => {
    const context = approvedContext();
    const output = await new RepairPlanMaterializerExecutor().execute({
      id: "repairPlanMaterializer",
      type: "materialize",
      role: "RepairPlanMaterializer",
      description: "materialize",
      inputKeys: ["scopedRepairPlan", "repairApprovalRecord"],
      outputKey: "codeChangePlan",
      outputSchema: "CodeChangePlan",
    }, context);

    const plan = SchemaValidator.validate("CodeChangePlan", output) as typeof context.codeChangePlan;
    assert.equal(plan?.executable, false);
    assert.equal(plan?.requiresExplicitExecutionApproval, true);
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

function approvedContext(): WorkflowContext {
  const context = failedContext();
  const plan = new RepairPlanBuilder().build(context);
  const approval = new HumanApprovalRequestBuilder().build(plan, new Date("2026-05-23T00:00:00.000Z"));
  return {
    ...context,
    scopedRepairPlan: plan,
    humanApprovalRequest: approval,
    repairApprovalRecord: {
      approvalId: approval.approvalId,
      repairPlanId: plan.planId,
      status: "approved",
      approvedAt: "2026-05-23T00:01:00.000Z",
      approvedBy: "user",
      note: "Approved for materialization only.",
    },
  };
}
