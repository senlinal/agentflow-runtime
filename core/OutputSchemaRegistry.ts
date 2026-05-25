import type { OutputSchemaName } from "./types.ts";

export const OUTPUT_SCHEMA_NAMES: OutputSchemaName[] = [
  "TaskBrief",
  "TaskNegotiationResult",
  "ScopeConfirmationRecord",
  "ConfirmedScopeGateResult",
  "AutonomyDecision",
  "ResearchReport",
  "FeasibilityReport",
  "Plan",
  "Critique",
  "RevisedPlan",
  "ExecutionResult",
  "VerificationReport",
  "ScopedRepairPlan",
  "HumanApprovalRequest",
  "CodeChangePlan",
  "CodeChangePlanExecutionApprovalRequest",
  "CodeChangePlanDryRunExecutionPlan",
  "CodeChangePlanExecutionRecord",
  "PatchExportRecord",
  "CorrectionHint",
  "GoalExecutionPlan",
  "ExecutionAttempt",
  "AttemptDecision",
  "CodeExecutionResult",
  "TestExecutionResult",
  "SmokeTestResult",
];

export function isSupportedOutputSchema(value: unknown): value is OutputSchemaName {
  return typeof value === "string" && OUTPUT_SCHEMA_NAMES.includes(value as OutputSchemaName);
}

export function getOutputSchemaShape(schemaName: OutputSchemaName): Record<string, unknown> {
  switch (schemaName) {
    case "TaskBrief":
      return {
        taskId: "string",
        goal: "string",
        userRequest: "string",
        taskType: "general_answer | rag_optimization | project_analysis | coding_fix | frontend_site_build | external_project_fix | unknown",
        expectedDeliverable: {
          type: "answer | analysis_report | code_change_plan | patch | experiment_plan | workflow_demo",
          description: "string",
        },
        answerRequirements: ["string optional"],
        contentQualityCriteria: ["string optional"],
        currentState: "string",
        constraints: ["string"],
        resources: ["string"],
        budget: "string",
        successCriteria: ["string"],
        nonGoals: ["string"],
        rawUserInput: "string optional",
      };
    case "TaskNegotiationResult":
      return {
        negotiationId: "string",
        understoodGoal: "string",
        detectedTaskType: "rag_optimization | coding_fix | refactor | documentation | research | unknown",
        targetModule: "string optional",
        complexity: "low | medium | high | unknown",
        ambiguities: ["string"],
        clarificationQuestions: ["string"],
        proposedScope: {
          allowedModules: ["string"],
          forbiddenModules: ["string"],
          allowedFiles: ["string optional"],
          forbiddenFiles: ["string optional"],
          allowedActions: ["string"],
          blockedActions: ["string"],
          qualityConstraints: ["string"],
        },
        suggestedTaskBreakdown: [{
          id: "string",
          title: "string",
          goal: "string",
          expectedOutput: "string",
          riskLevel: "low | medium | high",
        }],
        recommendedNextStep: "ask_human | proceed_to_feasibility | split_task | stop",
        readyToExecute: "boolean",
        reason: "string",
        createdAt: "string",
      };
    case "ScopeConfirmationRecord":
      return {
        confirmationId: "string",
        negotiationId: "string",
        sourceTaskBriefId: "string optional",
        status: "confirmed | rejected | needs_revision | expired",
        confirmedAt: "string optional",
        rejectedAt: "string optional",
        expiresAt: "string optional",
        confirmedBy: "string optional",
        humanOverride: "boolean",
        confirmedScope: {
          goal: "string",
          targetModule: "string optional",
          allowedModules: ["string"],
          forbiddenModules: ["string"],
          allowedFiles: ["string optional"],
          forbiddenFiles: ["string optional"],
          allowedActions: ["string"],
          blockedActions: ["string"],
          qualityConstraints: ["string"],
          metricDefinition: "object optional",
          ragConstraints: "object optional",
        },
        userAnswers: [{ question: "string", answer: "string" }],
        assumptionsAccepted: ["string"],
        assumptionsRejected: ["string"],
        notes: "string optional",
        createdAt: "string",
      };
    case "ConfirmedScopeGateResult":
      return {
        gateId: "string",
        confirmationId: "string optional",
        negotiationId: "string optional",
        allowed: "boolean",
        status: "allowed | blocked",
        reason: "string",
        blockedReasons: ["string"],
        confirmedScope: "object optional",
        recommendedNextStep: "proceed_to_feasibility | ask_human | revise_scope | stop",
        createdAt: "string",
      };
    case "AutonomyDecision":
      return {
        decision: "proceed | proceed_with_assumptions | ask_human | blocked | stop",
        reason: "string",
        confidence: "low | medium | high",
        canProceed: "boolean",
        mustAskHuman: "boolean",
        assumptions: ["string"],
        questionsToAsk: [{
          question: "string",
          reason: "string",
          blocking: "boolean",
          relatedMemoryIds: ["string optional"],
        }],
        blockedReasons: ["string"],
        safetyFindings: ["string"],
        referencedMemoryIds: ["string"],
        nextAllowedActions: ["string"],
        createdAt: "string",
      };
    case "ResearchReport":
      return {
        summary: "string",
        knownFacts: ["string"],
        unknowns: ["string"],
        dependencies: ["string"],
        risks: ["string"],
        evidence: ["string"],
        recommendedNextStep: "string",
      };
    case "FeasibilityReport":
      return {
        feasibility: "high | medium | low | unknown",
        decision: "proceed | proceed_with_risks | revise_goal | ask_human | stop",
        confidence: "number",
        costLevel: "low | medium | high | unknown",
        complexityLevel: "low | medium | high | unknown",
        riskLevel: "low | medium | high | unknown",
        blockingIssues: ["string"],
        majorRisks: ["string"],
        missingInformation: ["string"],
        requiredResources: ["string"],
        recommendedScope: "string",
        alternativePlans: ["string"],
        reason: "string",
      };
    case "Plan":
      return {
        planId: "string",
        summary: "string",
        taskUnderstanding: "string optional",
        proposedApproach: "string optional",
        deliverablePlan: "string optional",
        steps: [{ id: "string", action: "string", expectedOutput: "string" }],
        risks: ["string"],
        successCriteria: ["string"],
        successCriteriaMapping: "object optional",
        assumptions: ["string"],
      };
    case "Critique":
      return {
        issues: ["string"],
        risks: ["string"],
        missingRequirements: ["string"],
        suggestions: ["string"],
        severity: "low | medium | high",
      };
    case "RevisedPlan":
      return {
        ...getOutputSchemaShape("Plan"),
        basedOnCritique: ["string"],
        revisionNotes: ["string"],
      };
    case "ExecutionResult":
    case "CodeExecutionResult":
    case "TestExecutionResult":
      return {
        status: "success | failed | passed optional",
        deliverable: {
          type: "answer | analysis_report | code_change_plan | patch | experiment_plan | workflow_demo",
          content: "string",
        },
        evidenceOfCompletion: ["string optional"],
        limitations: ["string optional"],
        completedSteps: ["string"],
        artifacts: ["string"],
        summary: "string",
        errors: ["string"],
        rawOutput: "string",
      };
    case "VerificationReport":
      return {
        pass: "boolean",
        deliverableExists: "boolean optional",
        answersUserRequest: "boolean optional",
        meetsSuccessCriteria: "boolean optional",
        isNotMetaOnly: "boolean optional",
        missingRequirements: ["string optional"],
        score: "number",
        failedCriteria: ["string"],
        reason: "string",
        nextAction: "end | replan | retry_execute | ask_human",
        feedbackToPlanner: "string",
        failureCodes: ["string optional"],
        evidence: "object optional",
        safetyFindings: ["string optional"],
        recommendedFixes: ["string optional"],
      };
    case "ScopedRepairPlan":
      return {
        planId: "string",
        summary: "string",
        basedOnFailureCodes: ["string"],
        basedOnFailedCriteria: ["string"],
        targetFiles: ["string"],
        forbiddenFiles: ["string"],
        proposedOperations: [{
          id: "string",
          type: "modify_file | create_file | run_test | inspect | manual_review",
          description: "string",
          targetFile: "string optional",
          command: "string optional",
          content: "string optional",
          reason: "string",
          safetyConstraints: ["string"],
        }],
        testCommands: ["string"],
        riskLevel: "low | medium | high",
        requiresHumanApproval: "boolean",
        rationale: "string",
        safetyNotes: ["string"],
      };
    case "HumanApprovalRequest":
      return {
        approvalId: "string",
        status: "pending",
        summary: "string",
        repairPlanId: "string",
        requestedAction: "approve_scoped_repair_plan",
        riskLevel: "low | medium | high",
        requiresHumanApproval: "boolean",
        blockedUntilApproved: "boolean",
        approvalInstructions: ["string"],
        createdAt: "string",
      };
    case "CodeChangePlan":
      return {
        planId: "string",
        repairPlanId: "string",
        approvalId: "string",
        status: "materialized",
        summary: "string",
        operations: [{
          id: "string",
          type: "modify_file | create_file | run_test | inspect | manual_review",
          targetFile: "string optional",
          command: "string optional",
          content: "string optional",
          description: "string",
          reason: "string",
          safetyConstraints: ["string"],
        }],
        targetFiles: ["string"],
        forbiddenFiles: ["string"],
        testCommands: ["string"],
        riskLevel: "low | medium | high",
        safetyChecks: ["string"],
        blockedOperations: ["string"],
        executable: "false",
        requiresExplicitExecutionApproval: "boolean",
        createdAt: "string",
      };
    case "CodeChangePlanExecutionApprovalRequest":
      return {
        approvalId: "string",
        codeChangePlanId: "string",
        codeChangePlanHash: "string",
        status: "pending | approved | rejected | expired | consumed",
        requestedAction: "approve_code_change_plan_execution",
        blockedUntilApproved: "boolean",
        requiresExplicitExecutionApproval: "boolean",
        summary: "string",
        riskLevel: "low | medium | high",
        reason: "string",
        targetFiles: ["string"],
        operationsCount: "number",
        testCommands: ["string"],
        createdAt: "string",
        expiresAt: "string optional",
      };
    case "CodeChangePlanDryRunExecutionPlan":
      return {
        dryRunId: "string",
        codeChangePlanId: "string",
        codeChangePlanHash: "string",
        approvalId: "string",
        approvalStatus: "approved",
        status: "planned",
        mode: "dry_run",
        hashMatched: "true",
        summary: "string",
        operations: [{
          id: "string",
          type: "modify_file | create_file | run_test | inspect | manual_review",
          targetFile: "string optional",
          command: "string optional",
          content: "string optional",
          description: "string",
          reason: "string",
          safetyConstraints: ["string"],
        }],
        targetFiles: ["string"],
        expectedFilesChanged: ["string"],
        forbiddenFiles: ["string"],
        testCommands: ["string"],
        riskLevel: "low | medium | high",
        safetyChecks: ["string"],
        blockedReasons: ["string"],
        wouldWriteFiles: "false",
        wouldRunCommands: "false",
        wouldRunTests: "false",
        wouldCallCodeExecutor: "false",
        consumesApproval: "false",
        requiresExecuteFlag: "true",
        requiresSeparateExecutionStep: "true",
        createdAt: "string",
      };
    case "CodeChangePlanExecutionRecord":
      return {
        executionId: "string",
        codeChangePlanId: "string",
        approvalId: "string",
        codeChangePlanHash: "string",
        hashMatched: "true",
        status: "executed | failed | blocked",
        startedAt: "string",
        finishedAt: "string optional",
        checkpointId: "string optional",
        consumedApproval: "boolean",
        codeExecutionResult: "CodeExecutionResult optional",
        testExecutionResult: "TestExecutionResult optional",
        verification: "VerificationReport optional",
        rollbackGuide: {
          rollbackId: "string optional",
          checkpointId: "string optional",
          workspaceRoot: "string optional",
          summary: "string",
          changedFiles: ["string"],
          suggestedCommands: ["string"],
          manualSteps: ["string"],
          reason: "string optional",
          destructiveRollbackAvailable: "false optional",
          destructiveRollbackPerformed: "false",
        },
        rollbackGuideId: "string optional",
        executionRecordPath: "string optional",
        rollbackGuidePath: "string optional",
        blockedReasons: ["string"],
        safetyFindings: ["string"],
      };
    case "PatchExportRecord":
      return {
        patchExportId: "string",
        executionId: "string",
        sourceProjectPath: "string",
        workspaceRoot: "string",
        patchPath: "string",
        metadataPath: "string",
        applyGuidePath: "string",
        patchHash: "sha256:string",
        changedFiles: ["string"],
        filesAdded: ["string"],
        filesModified: ["string"],
        filesDeleted: ["string"],
        insertions: "number optional",
        deletions: "number optional",
        testStatus: "string optional",
        verificationPass: "boolean optional",
        createdAt: "string",
        safeToApplyManually: "boolean",
        warnings: ["string"],
      };
    case "CorrectionHint":
      return {
        driftDetected: "boolean",
        originalGoalReminder: "string",
        failedCriteria: ["string"],
        correctionInstructions: ["string"],
        recommendedNextAction: "replan | retry_execute | ask_human",
      };
    case "GoalExecutionPlan":
      return {
        planId: "string",
        goal: "string",
        successCriteria: ["string"],
        candidateRoutes: [{
          routeId: "string",
          summary: "string",
          expectedOutcome: "string",
          costLevel: "low | medium | high",
          riskLevel: "low | medium | high",
          repairableFailureCodes: ["string"],
        }],
        stopConditions: ["string"],
        escalationConditions: ["string"],
        maxAttempts: "number",
        costBudget: "low | medium | high",
        riskBudget: "low | medium | high",
        createdAt: "string",
      };
    case "ExecutionAttempt":
      return {
        attemptId: "string",
        attemptNumber: "number",
        routeId: "string",
        actionSummary: "string",
        inputArtifacts: ["string"],
        outputArtifacts: ["string"],
        resultSummary: "string",
        verifierResult: "object optional",
        failureReason: "string optional",
        createdAt: "string",
      };
    case "AttemptDecision":
      return {
        decision: "success | retry | revise_plan | ask_human | stop",
        reason: "string",
        nextRouteId: "string optional",
        blockedReasons: ["string"],
        shouldUpdateMemory: "boolean",
        failureAnalysis: "object optional",
        attemptId: "string optional",
        attemptNumber: "number optional",
        routeId: "string optional",
        createdAt: "string",
      };
    case "SmokeTestResult":
      return {
        ok: "boolean",
        provider: "string",
        model: "string",
        message: "string",
      };
  }
}

export function getOutputSchemaInstruction(schemaName: OutputSchemaName): string {
  return [
    `Return only one JSON object that matches output schema ${schemaName}.`,
    "Do not wrap the JSON in markdown.",
    "Do not include explanations before or after the JSON.",
    `Schema shape: ${JSON.stringify(getOutputSchemaShape(schemaName))}`,
  ].join("\n");
}
