import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SchemaValidator } from "../core/SchemaValidator.ts";

describe("SchemaValidator", () => {
  it("fails when Plan is missing steps", () => {
    assert.throws(
      () => SchemaValidator.validate("Plan", {
        planId: "plan_1",
        summary: "missing steps",
        risks: [],
        successCriteria: [],
        assumptions: [],
      }),
      /Plan\.steps must be an array/,
    );
  });

  it("fails when VerificationReport.pass is not boolean", () => {
    assert.throws(
      () => SchemaValidator.validate("VerificationReport", {
        pass: "false",
        score: 0.5,
        failedCriteria: [],
        reason: "bad",
        nextAction: "replan",
        feedbackToPlanner: "fix",
      }),
      /VerificationReport\.pass must be a boolean/,
    );
  });

  it("fails when VerificationReport.nextAction is invalid", () => {
    assert.throws(
      () => SchemaValidator.validate("VerificationReport", {
        pass: false,
        score: 0.5,
        failedCriteria: [],
        reason: "bad",
        nextAction: "invent_action",
        feedbackToPlanner: "fix",
      }),
      /VerificationReport\.nextAction must be one of/,
    );
  });

  it("passes for a valid VerificationReport", () => {
    const output = {
      pass: true,
      score: 0.95,
      failedCriteria: [],
      reason: "ok",
      nextAction: "end",
      feedbackToPlanner: "done",
      failureCodes: [],
      evidence: { codeStatus: "success" },
      safetyFindings: [],
      recommendedFixes: [],
    };
    assert.deepEqual(SchemaValidator.validate("VerificationReport", output), output);
  });

  it("passes for a valid TaskBrief", () => {
    const output = validTaskBrief();
    assert.deepEqual(SchemaValidator.validate("TaskBrief", output), output);
  });

  it("fails when TaskBrief is missing goal", () => {
    const { goal: _goal, ...output } = validTaskBrief();
    assert.throws(() => SchemaValidator.validate("TaskBrief", output), /TaskBrief\.goal must be a string/);
  });

  it("passes for a valid ResearchReport", () => {
    const output = {
      summary: "summary",
      knownFacts: [],
      unknowns: [],
      dependencies: [],
      risks: [],
      evidence: [],
      recommendedNextStep: "next",
    };
    assert.deepEqual(SchemaValidator.validate("ResearchReport", output), output);
  });

  it("passes for a valid FeasibilityReport", () => {
    const output = validFeasibilityReport();
    assert.deepEqual(SchemaValidator.validate("FeasibilityReport", output), output);
  });

  it("fails when FeasibilityReport.decision is invalid", () => {
    assert.throws(
      () => SchemaValidator.validate("FeasibilityReport", { ...validFeasibilityReport(), decision: "go" }),
      /FeasibilityReport\.decision must be one of/,
    );
  });

  it("fails when FeasibilityReport.costLevel is invalid", () => {
    assert.throws(
      () => SchemaValidator.validate("FeasibilityReport", { ...validFeasibilityReport(), costLevel: "massive" }),
      /FeasibilityReport\.costLevel must be one of/,
    );
  });

  it("passes for a valid SmokeTestResult", () => {
    const output = {
      ok: true,
      provider: "mock",
      model: "mock-structured",
      message: "ok",
    };
    assert.deepEqual(SchemaValidator.validate("SmokeTestResult", output), output);
  });

  it("passes for a valid ScopedRepairPlan", () => {
    const output = {
      planId: "repair_1",
      summary: "repair",
      basedOnFailureCodes: ["test_failed"],
      basedOnFailedCriteria: ["test_failed: tests failed"],
      targetFiles: ["src/index.ts"],
      forbiddenFiles: [".env"],
      proposedOperations: [{
        id: "op_1",
        type: "modify_file",
        description: "Patch target file",
        targetFile: "src/index.ts",
        reason: "test failed",
        safetyConstraints: ["No deletion"],
      }],
      testCommands: ["npm run test"],
      riskLevel: "low",
      requiresHumanApproval: true,
      rationale: "verification failed",
      safetyNotes: ["No automatic execution"],
    };
    assert.deepEqual(SchemaValidator.validate("ScopedRepairPlan", output), output);
  });

  it("fails when ScopedRepairPlan riskLevel is invalid", () => {
    assert.throws(
      () => SchemaValidator.validate("ScopedRepairPlan", {
        planId: "repair_1",
        summary: "repair",
        basedOnFailureCodes: [],
        basedOnFailedCriteria: [],
        targetFiles: [],
        forbiddenFiles: [],
        proposedOperations: [],
        testCommands: [],
        riskLevel: "critical",
        requiresHumanApproval: true,
        rationale: "reason",
        safetyNotes: [],
      }),
      /ScopedRepairPlan\.riskLevel must be one of/,
    );
  });

  it("fails when ScopedRepairPlan is missing targetFiles", () => {
    assert.throws(
      () => SchemaValidator.validate("ScopedRepairPlan", {
        planId: "repair_1",
        summary: "repair",
        basedOnFailureCodes: [],
        basedOnFailedCriteria: [],
        forbiddenFiles: [],
        proposedOperations: [],
        testCommands: [],
        riskLevel: "low",
        requiresHumanApproval: true,
        rationale: "reason",
        safetyNotes: [],
      }),
      /ScopedRepairPlan\.targetFiles must be an array/,
    );
  });

  it("passes for a valid HumanApprovalRequest", () => {
    const output = {
      approvalId: "approval_1",
      status: "pending",
      summary: "approval",
      repairPlanId: "repair_1",
      requestedAction: "approve_scoped_repair_plan",
      riskLevel: "medium",
      requiresHumanApproval: true,
      blockedUntilApproved: true,
      approvalInstructions: ["Review the plan"],
      createdAt: "2026-05-23T00:00:00.000Z",
    };
    assert.deepEqual(SchemaValidator.validate("HumanApprovalRequest", output), output);
  });

  it("fails when HumanApprovalRequest is missing status", () => {
    assert.throws(
      () => SchemaValidator.validate("HumanApprovalRequest", {
        approvalId: "approval_1",
        summary: "approval",
        repairPlanId: "repair_1",
        requestedAction: "approve_scoped_repair_plan",
        riskLevel: "medium",
        requiresHumanApproval: true,
        blockedUntilApproved: true,
        approvalInstructions: ["Review the plan"],
        createdAt: "2026-05-23T00:00:00.000Z",
      }),
      /HumanApprovalRequest\.status must be one of/,
    );
  });

  it("passes for a valid CodeChangePlan", () => {
    const output = {
      planId: "code_change_1",
      repairPlanId: "repair_1",
      approvalId: "approval_1",
      status: "materialized",
      summary: "safe plan",
      operations: [{
        id: "op_1",
        type: "modify_file",
        targetFile: "src/generated.txt",
        description: "Prepare a patch.",
        reason: "Fix failed test.",
        safetyConstraints: ["No delete."],
      }],
      targetFiles: ["src/generated.txt"],
      forbiddenFiles: [".env"],
      testCommands: ["npm run test"],
      riskLevel: "low",
      safetyChecks: ["approval status is approved"],
      blockedOperations: [],
      executable: false,
      requiresExplicitExecutionApproval: true,
      createdAt: "2026-05-23T00:00:00.000Z",
    };

    assert.deepEqual(SchemaValidator.validate("CodeChangePlan", output), output);
  });

  it("fails when CodeChangePlan is executable", () => {
    assert.throws(
      () => SchemaValidator.validate("CodeChangePlan", {
        planId: "code_change_1",
        repairPlanId: "repair_1",
        approvalId: "approval_1",
        status: "materialized",
        summary: "unsafe plan",
        operations: [],
        targetFiles: [],
        forbiddenFiles: [],
        testCommands: [],
        riskLevel: "low",
        safetyChecks: [],
        blockedOperations: [],
        executable: true,
        requiresExplicitExecutionApproval: true,
        createdAt: "2026-05-23T00:00:00.000Z",
      }),
      /CodeChangePlan\.executable must be false/,
    );
  });

  it("passes for a valid CodeChangePlanExecutionApprovalRequest", () => {
    const output = {
      approvalId: "code_exec_approval_1",
      codeChangePlanId: "code_change_1",
      codeChangePlanHash: "sha256:abc123",
      status: "pending",
      requestedAction: "approve_code_change_plan_execution",
      blockedUntilApproved: true,
      requiresExplicitExecutionApproval: true,
      summary: "Execution approval required.",
      riskLevel: "low",
      reason: "A separate execution approval is required.",
      targetFiles: ["src/generated.txt"],
      operationsCount: 1,
      testCommands: ["npm run test"],
      createdAt: "2026-05-23T00:00:00.000Z",
    };

    assert.deepEqual(SchemaValidator.validate("CodeChangePlanExecutionApprovalRequest", output), output);
  });

  it("fails when CodeChangePlanExecutionApprovalRequest is missing hash", () => {
    assert.throws(
      () => SchemaValidator.validate("CodeChangePlanExecutionApprovalRequest", {
        approvalId: "code_exec_approval_1",
        codeChangePlanId: "code_change_1",
        status: "pending",
        requestedAction: "approve_code_change_plan_execution",
        blockedUntilApproved: true,
        requiresExplicitExecutionApproval: true,
        summary: "Execution approval required.",
        riskLevel: "low",
        reason: "A separate execution approval is required.",
        targetFiles: ["src/generated.txt"],
        operationsCount: 1,
        testCommands: ["npm run test"],
        createdAt: "2026-05-23T00:00:00.000Z",
      }),
      /CodeChangePlanExecutionApprovalRequest\.codeChangePlanHash must be a string/,
    );
  });

  it("fails when SmokeTestResult.ok is not boolean", () => {
    assert.throws(
      () =>
        SchemaValidator.validate("SmokeTestResult", {
          ok: "true",
          provider: "mock",
          model: "mock-structured",
          message: "ok",
        }),
      /SmokeTestResult\.ok must be a boolean/,
    );
  });
});

function validTaskBrief() {
  return {
    taskId: "task_1",
    goal: "goal",
    currentState: "state",
    constraints: [],
    resources: [],
    budget: "low",
    successCriteria: [],
    nonGoals: [],
  };
}

function validFeasibilityReport() {
  return {
    feasibility: "high",
    decision: "proceed",
    confidence: 0.9,
    costLevel: "low",
    complexityLevel: "medium",
    riskLevel: "low",
    blockingIssues: [],
    majorRisks: [],
    missingInformation: [],
    requiredResources: [],
    recommendedScope: "scope",
    alternativePlans: [],
    reason: "reason",
  };
}
