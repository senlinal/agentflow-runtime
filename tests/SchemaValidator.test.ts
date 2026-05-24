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
      deliverableExists: true,
      answersUserRequest: true,
      meetsSuccessCriteria: true,
      isNotMetaOnly: true,
      missingRequirements: [],
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

  it("passes for valid deliverable-centered ExecutionResult", () => {
    const output = {
      status: "success",
      deliverable: {
        type: "answer",
        content: "手冲咖啡需要咖啡豆、热水、滤杯和滤纸，按粉水比萃取。",
      },
      evidenceOfCompletion: ["deliverable.content is present"],
      limitations: ["mock output"],
      completedSteps: ["produce_deliverable"],
      artifacts: ["answer deliverable"],
      summary: "Produced coffee answer.",
      errors: [],
      rawOutput: "{}",
    };
    assert.deepEqual(SchemaValidator.validate("ExecutionResult", output), output);
  });

  it("passes for a valid TaskNegotiationResult", () => {
    const output = validTaskNegotiationResult();
    assert.deepEqual(SchemaValidator.validate("TaskNegotiationResult", output), output);
  });

  it("fails when TaskNegotiationResult recommendedNextStep is invalid", () => {
    assert.throws(
      () => SchemaValidator.validate("TaskNegotiationResult", { ...validTaskNegotiationResult(), recommendedNextStep: "execute_now" }),
      /TaskNegotiationResult\.recommendedNextStep must be one of/,
    );
  });

  it("fails when TaskNegotiationResult proposedScope is missing blockedActions", () => {
    const output = validTaskNegotiationResult() as any;
    delete output.proposedScope.blockedActions;
    assert.throws(
      () => SchemaValidator.validate("TaskNegotiationResult", output),
      /TaskNegotiationResult\.proposedScope\.blockedActions must be an array/,
    );
  });

  it("passes for a valid ScopeConfirmationRecord", () => {
    const output = validScopeConfirmationRecord();
    assert.deepEqual(SchemaValidator.validate("ScopeConfirmationRecord", output), output);
  });

  it("fails when ScopeConfirmationRecord status is invalid", () => {
    assert.throws(
      () => SchemaValidator.validate("ScopeConfirmationRecord", { ...validScopeConfirmationRecord(), status: "approved" }),
      /ScopeConfirmationRecord\.status must be one of/,
    );
  });

  it("passes for a valid ConfirmedScopeGateResult", () => {
    const output = {
      gateId: "gate_1",
      confirmationId: "scope_1",
      negotiationId: "neg_1",
      allowed: true,
      status: "allowed",
      reason: "ok",
      blockedReasons: [],
      confirmedScope: validScopeConfirmationRecord().confirmedScope,
      recommendedNextStep: "proceed_to_feasibility",
      createdAt: "2026-05-23T00:00:00.000Z",
    };
    assert.deepEqual(SchemaValidator.validate("ConfirmedScopeGateResult", output), output);
  });

  it("passes for a valid AutonomyDecision", () => {
    const output = validAutonomyDecision();
    assert.deepEqual(SchemaValidator.validate("AutonomyDecision", output), output);
  });

  it("fails when AutonomyDecision decision is invalid", () => {
    assert.throws(
      () => SchemaValidator.validate("AutonomyDecision", { ...validAutonomyDecision(), decision: "maybe" }),
      /AutonomyDecision\.decision must be one of/,
    );
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

  it("passes for a valid CodeChangePlanDryRunExecutionPlan", () => {
    const output = {
      dryRunId: "dry_run_1",
      codeChangePlanId: "code_change_1",
      codeChangePlanHash: "sha256:abc123",
      approvalId: "code_exec_approval_1",
      approvalStatus: "approved",
      status: "planned",
      mode: "dry_run",
      hashMatched: true,
      summary: "dry-run only",
      operations: [{
        id: "op_1",
        type: "modify_file",
        targetFile: "src/generated.txt",
        description: "Prepare patch.",
        reason: "Fix failed test.",
        safetyConstraints: ["No delete."],
      }],
      targetFiles: ["src/generated.txt"],
      expectedFilesChanged: ["src/generated.txt"],
      forbiddenFiles: [".env"],
      testCommands: ["npm run test"],
      riskLevel: "low",
      safetyChecks: ["hash matches"],
      blockedReasons: [],
      wouldWriteFiles: false,
      wouldRunCommands: false,
      wouldRunTests: false,
      wouldCallCodeExecutor: false,
      consumesApproval: false,
      requiresExecuteFlag: true,
      requiresSeparateExecutionStep: true,
      createdAt: "2026-05-23T00:00:00.000Z",
    };

    assert.deepEqual(SchemaValidator.validate("CodeChangePlanDryRunExecutionPlan", output), output);
  });

  it("fails when CodeChangePlanDryRunExecutionPlan would write files", () => {
    assert.throws(
      () => SchemaValidator.validate("CodeChangePlanDryRunExecutionPlan", {
        dryRunId: "dry_run_1",
        codeChangePlanId: "code_change_1",
        codeChangePlanHash: "sha256:abc123",
        approvalId: "code_exec_approval_1",
        approvalStatus: "approved",
        status: "planned",
        mode: "dry_run",
        hashMatched: true,
        summary: "dry-run only",
        operations: [],
        targetFiles: [],
        expectedFilesChanged: [],
        forbiddenFiles: [],
        testCommands: [],
        riskLevel: "low",
        safetyChecks: [],
        blockedReasons: [],
        wouldWriteFiles: true,
        wouldRunCommands: false,
        wouldRunTests: false,
        wouldCallCodeExecutor: false,
        consumesApproval: false,
        requiresExecuteFlag: true,
        requiresSeparateExecutionStep: true,
        createdAt: "2026-05-23T00:00:00.000Z",
      }),
      /CodeChangePlanDryRunExecutionPlan\.wouldWriteFiles must be false/,
    );
  });

  it("passes for a valid CodeChangePlanExecutionRecord", () => {
    const output = {
      executionId: "code_exec_1",
      codeChangePlanId: "code_change_1",
      approvalId: "approval_1",
      codeChangePlanHash: "sha256:abc123",
      hashMatched: true,
      status: "executed",
      startedAt: "2026-05-23T00:00:00.000Z",
      finishedAt: "2026-05-23T00:01:00.000Z",
      checkpointId: "checkpoint_1",
      consumedApproval: true,
      codeExecutionResult: {
        status: "success",
        completedSteps: ["Created checkpoint checkpoint_1"],
        artifacts: ["src/generated.txt"],
        summary: "ok",
        errors: [],
        rawOutput: "{}",
      },
      testExecutionResult: {
        status: "passed",
        completedSteps: ["Ran npm run test"],
        artifacts: [],
        summary: "ok",
        errors: [],
        rawOutput: "{}",
      },
      verification: validVerificationReport(),
      rollbackGuide: {
        checkpointId: "checkpoint_1",
        summary: "manual rollback only",
        changedFiles: ["src/generated.txt"],
        manualSteps: ["Inspect diff."],
        destructiveRollbackPerformed: false,
      },
      blockedReasons: [],
      safetyFindings: [],
    };

    assert.deepEqual(SchemaValidator.validate("CodeChangePlanExecutionRecord", output), output);
  });

  it("passes for a valid PatchExportRecord", () => {
    const output = {
      patchExportId: "patch_export_test",
      executionId: "code_exec_test",
      sourceProjectPath: "/tmp/source",
      workspaceRoot: "/tmp/workspace",
      patchPath: ".agentflow/patch-exports/exports/patch_export_test/changes.patch",
      metadataPath: ".agentflow/patch-exports/exports/patch_export_test/metadata.json",
      applyGuidePath: ".agentflow/patch-exports/exports/patch_export_test/APPLY_GUIDE.md",
      patchHash: "sha256:abc123",
      changedFiles: ["src/calculator.ts"],
      filesAdded: [],
      filesModified: ["src/calculator.ts"],
      filesDeleted: [],
      insertions: 1,
      deletions: 1,
      testStatus: "passed",
      verificationPass: true,
      createdAt: "2026-05-23T00:00:00.000Z",
      safeToApplyManually: true,
      warnings: [],
    };

    assert.deepEqual(SchemaValidator.validate("PatchExportRecord", output), output);
  });

  it("fails when PatchExportRecord hash is not sha256", () => {
    assert.throws(() => SchemaValidator.validate("PatchExportRecord", {
      patchExportId: "patch_export_test",
      executionId: "code_exec_test",
      sourceProjectPath: "/tmp/source",
      workspaceRoot: "/tmp/workspace",
      patchPath: "changes.patch",
      metadataPath: "metadata.json",
      applyGuidePath: "APPLY_GUIDE.md",
      patchHash: "abc123",
      changedFiles: [],
      filesAdded: [],
      filesModified: [],
      filesDeleted: [],
      createdAt: "2026-05-23T00:00:00.000Z",
      safeToApplyManually: false,
      warnings: [],
    }), /patchHash/);
  });

  it("fails when CodeChangePlanExecutionRecord rollback guide performs destructive rollback", () => {
    assert.throws(
      () => SchemaValidator.validate("CodeChangePlanExecutionRecord", {
        executionId: "code_exec_1",
        codeChangePlanId: "code_change_1",
        approvalId: "approval_1",
        codeChangePlanHash: "sha256:abc123",
        hashMatched: true,
        status: "failed",
        startedAt: "2026-05-23T00:00:00.000Z",
        consumedApproval: true,
        rollbackGuide: {
          summary: "bad",
          changedFiles: [],
          manualSteps: [],
          destructiveRollbackPerformed: true,
        },
        blockedReasons: [],
        safetyFindings: [],
      }),
      /RollbackGuide\.destructiveRollbackPerformed must be false/,
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
    userRequest: "goal",
    taskType: "general_answer",
    expectedDeliverable: {
      type: "answer",
      description: "A direct answer.",
    },
    answerRequirements: [],
    contentQualityCriteria: [],
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

function validTaskNegotiationResult() {
  return {
    negotiationId: "neg_1",
    understoodGoal: "clarify RAG scope",
    detectedTaskType: "rag_optimization",
    targetModule: "rag",
    complexity: "medium",
    ambiguities: ["Target metric is unclear."],
    clarificationQuestions: ["Which retrieval metric should be optimized?"],
    proposedScope: {
      allowedModules: ["rag"],
      forbiddenModules: ["billing"],
      allowedFiles: ["src/rag/retriever.ts"],
      forbiddenFiles: [".env"],
      allowedActions: ["inspect_project"],
      blockedActions: ["execute_code", "modify_files", "delete_files"],
      qualityConstraints: ["Confirm scope before planning."],
    },
    suggestedTaskBreakdown: [{
      id: "scope_confirmation",
      title: "Confirm RAG scope",
      goal: "Confirm module and metric.",
      expectedOutput: "Confirmed scope.",
      riskLevel: "medium",
    }],
    recommendedNextStep: "ask_human",
    readyToExecute: false,
    reason: "Need scope confirmation.",
    createdAt: "2026-05-23T00:00:00.000Z",
  };
}

function validScopeConfirmationRecord() {
  return {
    confirmationId: "scope_1",
    negotiationId: "neg_1",
    sourceTaskBriefId: "task_1",
    status: "confirmed",
    confirmedAt: "2026-05-23T00:00:00.000Z",
    confirmedBy: "human",
    humanOverride: false,
    confirmedScope: {
      goal: "Improve RAG retrieval quality.",
      targetModule: "rag",
      allowedModules: ["rag"],
      forbiddenModules: [],
      allowedFiles: ["src/rag/retriever.ts"],
      forbiddenFiles: [".env"],
      allowedActions: ["inspect_project", "evaluate_feasibility"],
      blockedActions: ["execute_code", "modify_files", "delete_files"],
      qualityConstraints: ["No answer quality regression."],
      metricDefinition: {
        primaryMetric: "answer relevance",
        secondaryMetrics: ["citation coverage"],
        targetValue: "improve relevance",
        evaluationDataset: "offline eval set",
      },
      ragConstraints: {
        recallLevel: "chunk",
        allowChunkChanges: true,
        allowIndexRebuild: false,
        allowRerankerChanges: false,
        allowQueryRewrite: true,
        allowAnswerQualityRegression: false,
        productionChangesAllowed: false,
      },
    },
    userAnswers: [{ question: "Metric?", answer: "answer relevance" }],
    assumptionsAccepted: [],
    assumptionsRejected: [],
    notes: "confirmed",
    createdAt: "2026-05-23T00:00:00.000Z",
  };
}

function validAutonomyDecision() {
  return {
    decision: "proceed",
    reason: "No blockers.",
    confidence: "high",
    canProceed: true,
    mustAskHuman: false,
    assumptions: [],
    questionsToAsk: [],
    blockedReasons: [],
    safetyFindings: [],
    referencedMemoryIds: [],
    nextAllowedActions: ["run_task_negotiation"],
    createdAt: "2026-05-23T00:00:00.000Z",
  };
}

function validVerificationReport() {
  return {
    pass: true,
    score: 0.97,
    failedCriteria: [],
    reason: "ok",
    nextAction: "end",
    feedbackToPlanner: "done",
  };
}
