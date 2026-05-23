import type {
  CorrectionHint,
  Critique,
  ExecutionResult,
  FeasibilityReport,
  CodeChangePlan,
  CodeChangePlanDryRunExecutionPlan,
  CodeChangePlanExecutionRecord,
  CodeChangePlanExecutionApprovalRequest,
  OutputSchemaName,
  PatchExportRecord,
  Plan,
  ResearchReport,
  RevisedPlan,
  ScopedRepairPlan,
  SmokeTestResult,
  TaskBrief,
  TaskNegotiationResult,
  VerificationReport,
  HumanApprovalRequest,
} from "./types.ts";

const ALLOWED_NEXT_ACTIONS: VerificationReport["nextAction"][] = [
  "end",
  "replan",
  "retry_execute",
  "ask_human",
];

export class SchemaValidator {
  static validate(schemaName: OutputSchemaName, output: unknown): unknown {
    switch (schemaName) {
      case "TaskBrief":
        return validateTaskBrief(output);
      case "TaskNegotiationResult":
        return validateTaskNegotiationResult(output);
      case "ResearchReport":
        return validateResearchReport(output);
      case "FeasibilityReport":
        return validateFeasibilityReport(output);
      case "Plan":
        return validatePlan(output, "Plan");
      case "Critique":
        return validateCritique(output);
      case "RevisedPlan":
        return validateRevisedPlan(output);
      case "ExecutionResult":
        return validateExecutionResult(output);
      case "CodeExecutionResult":
        return validateExecutionResult(output);
      case "TestExecutionResult":
        return validateExecutionResult(output);
      case "VerificationReport":
        return validateVerificationReport(output);
      case "ScopedRepairPlan":
        return validateScopedRepairPlan(output);
      case "HumanApprovalRequest":
        return validateHumanApprovalRequest(output);
      case "CodeChangePlan":
        return validateCodeChangePlan(output);
      case "CodeChangePlanExecutionApprovalRequest":
        return validateCodeChangePlanExecutionApprovalRequest(output);
      case "CodeChangePlanDryRunExecutionPlan":
        return validateCodeChangePlanDryRunExecutionPlan(output);
      case "CodeChangePlanExecutionRecord":
        return validateCodeChangePlanExecutionRecord(output);
      case "PatchExportRecord":
        return validatePatchExportRecord(output);
      case "CorrectionHint":
        return validateCorrectionHint(output);
      case "SmokeTestResult":
        return validateSmokeTestResult(output);
      default:
        throw new Error(`Unsupported output schema: ${String(schemaName)}`);
    }
  }
}

function validateTaskNegotiationResult(output: unknown): TaskNegotiationResult {
  const record = requireObject(output, "TaskNegotiationResult");
  requireString(record, "negotiationId", "TaskNegotiationResult");
  requireString(record, "understoodGoal", "TaskNegotiationResult");
  requireEnum(
    record,
    "detectedTaskType",
    ["rag_optimization", "coding_fix", "refactor", "documentation", "research", "unknown"],
    "TaskNegotiationResult",
  );
  if ("targetModule" in record && typeof record.targetModule !== "string") {
    throw new Error("TaskNegotiationResult.targetModule must be a string when provided.");
  }
  requireEnum(record, "complexity", ["low", "medium", "high", "unknown"], "TaskNegotiationResult");
  requireArray(record, "ambiguities", "TaskNegotiationResult");
  requireArray(record, "clarificationQuestions", "TaskNegotiationResult");
  const scope = requireObject(record.proposedScope, "TaskNegotiationResult.proposedScope");
  requireArray(scope, "allowedModules", "TaskNegotiationResult.proposedScope");
  requireArray(scope, "forbiddenModules", "TaskNegotiationResult.proposedScope");
  if ("allowedFiles" in scope) requireArray(scope, "allowedFiles", "TaskNegotiationResult.proposedScope");
  if ("forbiddenFiles" in scope) requireArray(scope, "forbiddenFiles", "TaskNegotiationResult.proposedScope");
  requireArray(scope, "allowedActions", "TaskNegotiationResult.proposedScope");
  requireArray(scope, "blockedActions", "TaskNegotiationResult.proposedScope");
  requireArray(scope, "qualityConstraints", "TaskNegotiationResult.proposedScope");
  requireArray(record, "suggestedTaskBreakdown", "TaskNegotiationResult");
  record.suggestedTaskBreakdown.forEach((step, index) => {
    const item = requireObject(step, `TaskNegotiationResult.suggestedTaskBreakdown[${index}]`);
    requireString(item, "id", `TaskNegotiationResult.suggestedTaskBreakdown[${index}]`);
    requireString(item, "title", `TaskNegotiationResult.suggestedTaskBreakdown[${index}]`);
    requireString(item, "goal", `TaskNegotiationResult.suggestedTaskBreakdown[${index}]`);
    requireString(item, "expectedOutput", `TaskNegotiationResult.suggestedTaskBreakdown[${index}]`);
    requireEnum(item, "riskLevel", ["low", "medium", "high"], `TaskNegotiationResult.suggestedTaskBreakdown[${index}]`);
  });
  requireEnum(record, "recommendedNextStep", ["ask_human", "proceed_to_feasibility", "split_task", "stop"], "TaskNegotiationResult");
  requireBoolean(record, "readyToExecute", "TaskNegotiationResult");
  requireString(record, "reason", "TaskNegotiationResult");
  requireString(record, "createdAt", "TaskNegotiationResult");
  return record as TaskNegotiationResult;
}

function validateTaskBrief(output: unknown): TaskBrief {
  const record = requireObject(output, "TaskBrief");
  requireString(record, "taskId", "TaskBrief");
  requireString(record, "goal", "TaskBrief");
  requireString(record, "currentState", "TaskBrief");
  requireArray(record, "constraints", "TaskBrief");
  requireArray(record, "resources", "TaskBrief");
  requireString(record, "budget", "TaskBrief");
  requireArray(record, "successCriteria", "TaskBrief");
  requireArray(record, "nonGoals", "TaskBrief");
  if ("rawUserInput" in record && typeof record.rawUserInput !== "string") {
    throw new Error("TaskBrief.rawUserInput must be a string when provided.");
  }
  return record as TaskBrief;
}

function validateResearchReport(output: unknown): ResearchReport {
  const record = requireObject(output, "ResearchReport");
  requireString(record, "summary", "ResearchReport");
  requireArray(record, "knownFacts", "ResearchReport");
  requireArray(record, "unknowns", "ResearchReport");
  requireArray(record, "dependencies", "ResearchReport");
  requireArray(record, "risks", "ResearchReport");
  requireArray(record, "evidence", "ResearchReport");
  requireString(record, "recommendedNextStep", "ResearchReport");
  return record as ResearchReport;
}

function validateFeasibilityReport(output: unknown): FeasibilityReport {
  const record = requireObject(output, "FeasibilityReport");
  requireEnum(record, "feasibility", ["high", "medium", "low", "unknown"], "FeasibilityReport");
  requireEnum(
    record,
    "decision",
    ["proceed", "proceed_with_risks", "revise_goal", "ask_human", "stop"],
    "FeasibilityReport",
  );
  requireNumber(record, "confidence", "FeasibilityReport");
  requireEnum(record, "costLevel", ["low", "medium", "high", "unknown"], "FeasibilityReport");
  requireEnum(record, "complexityLevel", ["low", "medium", "high", "unknown"], "FeasibilityReport");
  requireEnum(record, "riskLevel", ["low", "medium", "high", "unknown"], "FeasibilityReport");
  requireArray(record, "blockingIssues", "FeasibilityReport");
  requireArray(record, "majorRisks", "FeasibilityReport");
  requireArray(record, "missingInformation", "FeasibilityReport");
  requireArray(record, "requiredResources", "FeasibilityReport");
  requireString(record, "recommendedScope", "FeasibilityReport");
  requireArray(record, "alternativePlans", "FeasibilityReport");
  requireString(record, "reason", "FeasibilityReport");
  return record as FeasibilityReport;
}

function validatePlan(output: unknown, schemaName: string): Plan {
  const record = requireObject(output, schemaName);
  requireString(record, "planId", schemaName);
  requireString(record, "summary", schemaName);
  requireArray(record, "steps", schemaName);
  requireArray(record, "risks", schemaName);
  requireArray(record, "successCriteria", schemaName);
  requireArray(record, "assumptions", schemaName);

  record.steps.forEach((step, index) => {
    const stepRecord = requireObject(step, `${schemaName}.steps[${index}]`);
    requireString(stepRecord, "id", `${schemaName}.steps[${index}]`);
    requireString(stepRecord, "action", `${schemaName}.steps[${index}]`);
    requireString(stepRecord, "expectedOutput", `${schemaName}.steps[${index}]`);
  });
  return record as Plan;
}

function validateCritique(output: unknown): Critique {
  const record = requireObject(output, "Critique");
  requireArray(record, "issues", "Critique");
  requireArray(record, "risks", "Critique");
  requireArray(record, "missingRequirements", "Critique");
  requireArray(record, "suggestions", "Critique");
  requireEnum(record, "severity", ["low", "medium", "high"], "Critique");
  return record as Critique;
}

function validateRevisedPlan(output: unknown): RevisedPlan {
  const record = validatePlan(output, "RevisedPlan") as Record<string, unknown>;
  requireArray(record, "basedOnCritique", "RevisedPlan");
  requireArray(record, "revisionNotes", "RevisedPlan");
  return record as RevisedPlan;
}

function validateExecutionResult(output: unknown): ExecutionResult {
  const record = requireObject(output, "ExecutionResult");
  requireArray(record, "completedSteps", "ExecutionResult");
  requireArray(record, "artifacts", "ExecutionResult");
  requireString(record, "summary", "ExecutionResult");
  requireArray(record, "errors", "ExecutionResult");
  requireString(record, "rawOutput", "ExecutionResult");
  return record as ExecutionResult;
}

function validateVerificationReport(output: unknown): VerificationReport {
  const record = requireObject(output, "VerificationReport");
  requireBoolean(record, "pass", "VerificationReport");
  requireNumber(record, "score", "VerificationReport");
  requireArray(record, "failedCriteria", "VerificationReport");
  requireString(record, "reason", "VerificationReport");
  requireEnum(record, "nextAction", ALLOWED_NEXT_ACTIONS, "VerificationReport");
  requireString(record, "feedbackToPlanner", "VerificationReport");
  requireOptionalStringArray(record, "failureCodes", "VerificationReport");
  if ("evidence" in record) requireObject(record.evidence, "VerificationReport.evidence");
  requireOptionalStringArray(record, "safetyFindings", "VerificationReport");
  requireOptionalStringArray(record, "recommendedFixes", "VerificationReport");
  return record as VerificationReport;
}

function validateScopedRepairPlan(output: unknown): ScopedRepairPlan {
  const record = requireObject(output, "ScopedRepairPlan");
  requireString(record, "planId", "ScopedRepairPlan");
  requireString(record, "summary", "ScopedRepairPlan");
  requireArray(record, "basedOnFailureCodes", "ScopedRepairPlan");
  requireArray(record, "basedOnFailedCriteria", "ScopedRepairPlan");
  requireArray(record, "targetFiles", "ScopedRepairPlan");
  requireArray(record, "forbiddenFiles", "ScopedRepairPlan");
  requireArray(record, "proposedOperations", "ScopedRepairPlan");
  requireArray(record, "testCommands", "ScopedRepairPlan");
  requireEnum(record, "riskLevel", ["low", "medium", "high"], "ScopedRepairPlan");
  requireBoolean(record, "requiresHumanApproval", "ScopedRepairPlan");
  requireString(record, "rationale", "ScopedRepairPlan");
  requireArray(record, "safetyNotes", "ScopedRepairPlan");
  record.proposedOperations.forEach((operation, index) => {
    const item = requireObject(operation, `ScopedRepairPlan.proposedOperations[${index}]`);
    requireString(item, "id", `ScopedRepairPlan.proposedOperations[${index}]`);
    requireEnum(item, "type", ["modify_file", "create_file", "run_test", "inspect", "manual_review"], `ScopedRepairPlan.proposedOperations[${index}]`);
    requireString(item, "description", `ScopedRepairPlan.proposedOperations[${index}]`);
    if ("targetFile" in item && typeof item.targetFile !== "string") throw new Error(`ScopedRepairPlan.proposedOperations[${index}].targetFile must be a string when provided.`);
    if ("command" in item && typeof item.command !== "string") throw new Error(`ScopedRepairPlan.proposedOperations[${index}].command must be a string when provided.`);
    if ("content" in item && typeof item.content !== "string") throw new Error(`ScopedRepairPlan.proposedOperations[${index}].content must be a string when provided.`);
    requireString(item, "reason", `ScopedRepairPlan.proposedOperations[${index}]`);
    requireArray(item, "safetyConstraints", `ScopedRepairPlan.proposedOperations[${index}]`);
  });
  return record as ScopedRepairPlan;
}

function validateHumanApprovalRequest(output: unknown): HumanApprovalRequest {
  const record = requireObject(output, "HumanApprovalRequest");
  requireString(record, "approvalId", "HumanApprovalRequest");
  requireEnum(record, "status", ["pending"], "HumanApprovalRequest");
  requireString(record, "summary", "HumanApprovalRequest");
  requireString(record, "repairPlanId", "HumanApprovalRequest");
  requireEnum(record, "requestedAction", ["approve_scoped_repair_plan"], "HumanApprovalRequest");
  requireEnum(record, "riskLevel", ["low", "medium", "high"], "HumanApprovalRequest");
  requireBoolean(record, "requiresHumanApproval", "HumanApprovalRequest");
  requireBoolean(record, "blockedUntilApproved", "HumanApprovalRequest");
  requireArray(record, "approvalInstructions", "HumanApprovalRequest");
  requireString(record, "createdAt", "HumanApprovalRequest");
  return record as HumanApprovalRequest;
}

function validateCodeChangePlan(output: unknown): CodeChangePlan {
  const record = requireObject(output, "CodeChangePlan");
  requireString(record, "planId", "CodeChangePlan");
  requireString(record, "repairPlanId", "CodeChangePlan");
  requireString(record, "approvalId", "CodeChangePlan");
  requireEnum(record, "status", ["materialized"], "CodeChangePlan");
  requireString(record, "summary", "CodeChangePlan");
  requireArray(record, "operations", "CodeChangePlan");
  requireArray(record, "targetFiles", "CodeChangePlan");
  requireArray(record, "forbiddenFiles", "CodeChangePlan");
  requireArray(record, "testCommands", "CodeChangePlan");
  requireEnum(record, "riskLevel", ["low", "medium", "high"], "CodeChangePlan");
  requireArray(record, "safetyChecks", "CodeChangePlan");
  requireArray(record, "blockedOperations", "CodeChangePlan");
  if (record.executable !== false) throw new Error("CodeChangePlan.executable must be false.");
  requireBoolean(record, "requiresExplicitExecutionApproval", "CodeChangePlan");
  requireString(record, "createdAt", "CodeChangePlan");
  record.operations.forEach((operation, index) => {
    const item = requireObject(operation, `CodeChangePlan.operations[${index}]`);
    requireString(item, "id", `CodeChangePlan.operations[${index}]`);
    requireEnum(item, "type", ["modify_file", "create_file", "run_test", "inspect", "manual_review"], `CodeChangePlan.operations[${index}]`);
    if ("targetFile" in item && typeof item.targetFile !== "string") throw new Error(`CodeChangePlan.operations[${index}].targetFile must be a string when provided.`);
    if ("command" in item && typeof item.command !== "string") throw new Error(`CodeChangePlan.operations[${index}].command must be a string when provided.`);
    if ("content" in item && typeof item.content !== "string") throw new Error(`CodeChangePlan.operations[${index}].content must be a string when provided.`);
    requireString(item, "description", `CodeChangePlan.operations[${index}]`);
    requireString(item, "reason", `CodeChangePlan.operations[${index}]`);
    requireArray(item, "safetyConstraints", `CodeChangePlan.operations[${index}]`);
  });
  return record as CodeChangePlan;
}

function validateCodeChangePlanExecutionApprovalRequest(output: unknown): CodeChangePlanExecutionApprovalRequest {
  const record = requireObject(output, "CodeChangePlanExecutionApprovalRequest");
  requireString(record, "approvalId", "CodeChangePlanExecutionApprovalRequest");
  requireString(record, "codeChangePlanId", "CodeChangePlanExecutionApprovalRequest");
  requireString(record, "codeChangePlanHash", "CodeChangePlanExecutionApprovalRequest");
  requireEnum(record, "status", ["pending", "approved", "rejected", "expired", "consumed"], "CodeChangePlanExecutionApprovalRequest");
  requireEnum(record, "requestedAction", ["approve_code_change_plan_execution"], "CodeChangePlanExecutionApprovalRequest");
  requireBoolean(record, "blockedUntilApproved", "CodeChangePlanExecutionApprovalRequest");
  requireBoolean(record, "requiresExplicitExecutionApproval", "CodeChangePlanExecutionApprovalRequest");
  requireString(record, "summary", "CodeChangePlanExecutionApprovalRequest");
  requireEnum(record, "riskLevel", ["low", "medium", "high"], "CodeChangePlanExecutionApprovalRequest");
  requireString(record, "reason", "CodeChangePlanExecutionApprovalRequest");
  requireArray(record, "targetFiles", "CodeChangePlanExecutionApprovalRequest");
  requireNumber(record, "operationsCount", "CodeChangePlanExecutionApprovalRequest");
  requireArray(record, "testCommands", "CodeChangePlanExecutionApprovalRequest");
  requireString(record, "createdAt", "CodeChangePlanExecutionApprovalRequest");
  if ("expiresAt" in record && typeof record.expiresAt !== "string") {
    throw new Error("CodeChangePlanExecutionApprovalRequest.expiresAt must be a string when provided.");
  }
  return record as CodeChangePlanExecutionApprovalRequest;
}

function validateCodeChangePlanDryRunExecutionPlan(output: unknown): CodeChangePlanDryRunExecutionPlan {
  const record = requireObject(output, "CodeChangePlanDryRunExecutionPlan");
  requireString(record, "dryRunId", "CodeChangePlanDryRunExecutionPlan");
  requireString(record, "codeChangePlanId", "CodeChangePlanDryRunExecutionPlan");
  requireString(record, "codeChangePlanHash", "CodeChangePlanDryRunExecutionPlan");
  requireString(record, "approvalId", "CodeChangePlanDryRunExecutionPlan");
  requireEnum(record, "approvalStatus", ["approved"], "CodeChangePlanDryRunExecutionPlan");
  requireEnum(record, "status", ["planned"], "CodeChangePlanDryRunExecutionPlan");
  requireEnum(record, "mode", ["dry_run"], "CodeChangePlanDryRunExecutionPlan");
  if (record.hashMatched !== true) throw new Error("CodeChangePlanDryRunExecutionPlan.hashMatched must be true.");
  requireString(record, "summary", "CodeChangePlanDryRunExecutionPlan");
  requireArray(record, "operations", "CodeChangePlanDryRunExecutionPlan");
  requireArray(record, "targetFiles", "CodeChangePlanDryRunExecutionPlan");
  requireArray(record, "expectedFilesChanged", "CodeChangePlanDryRunExecutionPlan");
  requireArray(record, "forbiddenFiles", "CodeChangePlanDryRunExecutionPlan");
  requireArray(record, "testCommands", "CodeChangePlanDryRunExecutionPlan");
  requireEnum(record, "riskLevel", ["low", "medium", "high"], "CodeChangePlanDryRunExecutionPlan");
  requireArray(record, "safetyChecks", "CodeChangePlanDryRunExecutionPlan");
  requireArray(record, "blockedReasons", "CodeChangePlanDryRunExecutionPlan");
  if (record.wouldWriteFiles !== false) throw new Error("CodeChangePlanDryRunExecutionPlan.wouldWriteFiles must be false.");
  if (record.wouldRunCommands !== false) throw new Error("CodeChangePlanDryRunExecutionPlan.wouldRunCommands must be false.");
  if (record.wouldRunTests !== false) throw new Error("CodeChangePlanDryRunExecutionPlan.wouldRunTests must be false.");
  if (record.wouldCallCodeExecutor !== false) throw new Error("CodeChangePlanDryRunExecutionPlan.wouldCallCodeExecutor must be false.");
  if (record.consumesApproval !== false) throw new Error("CodeChangePlanDryRunExecutionPlan.consumesApproval must be false.");
  if (record.requiresExecuteFlag !== true) throw new Error("CodeChangePlanDryRunExecutionPlan.requiresExecuteFlag must be true.");
  if (record.requiresSeparateExecutionStep !== true) {
    throw new Error("CodeChangePlanDryRunExecutionPlan.requiresSeparateExecutionStep must be true.");
  }
  requireString(record, "createdAt", "CodeChangePlanDryRunExecutionPlan");
  record.operations.forEach((operation, index) => {
    const item = requireObject(operation, `CodeChangePlanDryRunExecutionPlan.operations[${index}]`);
    requireString(item, "id", `CodeChangePlanDryRunExecutionPlan.operations[${index}]`);
    requireEnum(item, "type", ["modify_file", "create_file", "run_test", "inspect", "manual_review"], `CodeChangePlanDryRunExecutionPlan.operations[${index}]`);
    if ("targetFile" in item && typeof item.targetFile !== "string") throw new Error(`CodeChangePlanDryRunExecutionPlan.operations[${index}].targetFile must be a string when provided.`);
    if ("command" in item && typeof item.command !== "string") throw new Error(`CodeChangePlanDryRunExecutionPlan.operations[${index}].command must be a string when provided.`);
    if ("content" in item && typeof item.content !== "string") throw new Error(`CodeChangePlanDryRunExecutionPlan.operations[${index}].content must be a string when provided.`);
    requireString(item, "description", `CodeChangePlanDryRunExecutionPlan.operations[${index}]`);
    requireString(item, "reason", `CodeChangePlanDryRunExecutionPlan.operations[${index}]`);
    requireArray(item, "safetyConstraints", `CodeChangePlanDryRunExecutionPlan.operations[${index}]`);
  });
  return record as CodeChangePlanDryRunExecutionPlan;
}

function validateCodeChangePlanExecutionRecord(output: unknown): CodeChangePlanExecutionRecord {
  const record = requireObject(output, "CodeChangePlanExecutionRecord");
  requireString(record, "executionId", "CodeChangePlanExecutionRecord");
  requireString(record, "codeChangePlanId", "CodeChangePlanExecutionRecord");
  requireString(record, "approvalId", "CodeChangePlanExecutionRecord");
  requireString(record, "codeChangePlanHash", "CodeChangePlanExecutionRecord");
  if (record.hashMatched !== true) throw new Error("CodeChangePlanExecutionRecord.hashMatched must be true.");
  requireEnum(record, "status", ["executed", "failed", "blocked"], "CodeChangePlanExecutionRecord");
  requireString(record, "startedAt", "CodeChangePlanExecutionRecord");
  if ("finishedAt" in record && typeof record.finishedAt !== "string") throw new Error("CodeChangePlanExecutionRecord.finishedAt must be a string when provided.");
  if ("checkpointId" in record && typeof record.checkpointId !== "string") throw new Error("CodeChangePlanExecutionRecord.checkpointId must be a string when provided.");
  requireBoolean(record, "consumedApproval", "CodeChangePlanExecutionRecord");
  if ("codeExecutionResult" in record) validateExecutionResult(record.codeExecutionResult);
  if ("testExecutionResult" in record) validateExecutionResult(record.testExecutionResult);
  if ("verification" in record) validateVerificationReport(record.verification);
  if ("rollbackGuide" in record) validateRollbackGuide(record.rollbackGuide);
  requireArray(record, "blockedReasons", "CodeChangePlanExecutionRecord");
  requireArray(record, "safetyFindings", "CodeChangePlanExecutionRecord");
  return record as CodeChangePlanExecutionRecord;
}

function validatePatchExportRecord(output: unknown): PatchExportRecord {
  const record = requireObject(output, "PatchExportRecord");
  requireString(record, "patchExportId", "PatchExportRecord");
  requireString(record, "executionId", "PatchExportRecord");
  requireString(record, "sourceProjectPath", "PatchExportRecord");
  requireString(record, "workspaceRoot", "PatchExportRecord");
  requireString(record, "patchPath", "PatchExportRecord");
  requireString(record, "metadataPath", "PatchExportRecord");
  requireString(record, "applyGuidePath", "PatchExportRecord");
  requireString(record, "patchHash", "PatchExportRecord");
  if (!record.patchHash.startsWith("sha256:")) throw new Error("PatchExportRecord.patchHash must start with sha256:.");
  requireArray(record, "changedFiles", "PatchExportRecord");
  requireArray(record, "filesAdded", "PatchExportRecord");
  requireArray(record, "filesModified", "PatchExportRecord");
  requireArray(record, "filesDeleted", "PatchExportRecord");
  if ("insertions" in record) requireNumber(record, "insertions", "PatchExportRecord");
  if ("deletions" in record) requireNumber(record, "deletions", "PatchExportRecord");
  if ("testStatus" in record && typeof record.testStatus !== "string") throw new Error("PatchExportRecord.testStatus must be a string when provided.");
  if ("verificationPass" in record && typeof record.verificationPass !== "boolean") throw new Error("PatchExportRecord.verificationPass must be a boolean when provided.");
  requireString(record, "createdAt", "PatchExportRecord");
  requireBoolean(record, "safeToApplyManually", "PatchExportRecord");
  requireArray(record, "warnings", "PatchExportRecord");
  return record as PatchExportRecord;
}

function validateRollbackGuide(output: unknown): void {
  const record = requireObject(output, "RollbackGuide");
  if ("rollbackId" in record && typeof record.rollbackId !== "string") throw new Error("RollbackGuide.rollbackId must be a string when provided.");
  if ("checkpointId" in record && typeof record.checkpointId !== "string") throw new Error("RollbackGuide.checkpointId must be a string when provided.");
  if ("workspaceRoot" in record && typeof record.workspaceRoot !== "string") throw new Error("RollbackGuide.workspaceRoot must be a string when provided.");
  requireString(record, "summary", "RollbackGuide");
  requireArray(record, "changedFiles", "RollbackGuide");
  if ("suggestedCommands" in record) requireArray(record, "suggestedCommands", "RollbackGuide");
  requireArray(record, "manualSteps", "RollbackGuide");
  if ("reason" in record && typeof record.reason !== "string") throw new Error("RollbackGuide.reason must be a string when provided.");
  if ("destructiveRollbackAvailable" in record && record.destructiveRollbackAvailable !== false) throw new Error("RollbackGuide.destructiveRollbackAvailable must be false when provided.");
  if (record.destructiveRollbackPerformed !== false) throw new Error("RollbackGuide.destructiveRollbackPerformed must be false.");
}

function validateCorrectionHint(output: unknown): CorrectionHint {
  const record = requireObject(output, "CorrectionHint");
  requireBoolean(record, "driftDetected", "CorrectionHint");
  requireString(record, "originalGoalReminder", "CorrectionHint");
  requireArray(record, "failedCriteria", "CorrectionHint");
  requireArray(record, "correctionInstructions", "CorrectionHint");
  requireEnum(record, "recommendedNextAction", ["replan", "retry_execute", "ask_human"], "CorrectionHint");
  return record as CorrectionHint;
}

function validateSmokeTestResult(output: unknown): SmokeTestResult {
  const record = requireObject(output, "SmokeTestResult");
  requireBoolean(record, "ok", "SmokeTestResult");
  requireString(record, "provider", "SmokeTestResult");
  requireString(record, "model", "SmokeTestResult");
  requireString(record, "message", "SmokeTestResult");
  return record as SmokeTestResult;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, key: string, label: string): void {
  if (typeof record[key] !== "string") throw new Error(`${label}.${key} must be a string.`);
}

function requireNumber(record: Record<string, unknown>, key: string, label: string): void {
  if (typeof record[key] !== "number" || Number.isNaN(record[key])) {
    throw new Error(`${label}.${key} must be a number.`);
  }
}

function requireBoolean(record: Record<string, unknown>, key: string, label: string): void {
  if (typeof record[key] !== "boolean") throw new Error(`${label}.${key} must be a boolean.`);
}

function requireArray(record: Record<string, unknown>, key: string, label: string): void {
  if (!Array.isArray(record[key])) throw new Error(`${label}.${key} must be an array.`);
}

function requireOptionalStringArray(record: Record<string, unknown>, key: string, label: string): void {
  if (!(key in record)) return;
  if (!Array.isArray(record[key]) || !(record[key] as unknown[]).every((item) => typeof item === "string")) {
    throw new Error(`${label}.${key} must be an array of strings when provided.`);
  }
}

function requireEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  label: string,
): void {
  if (typeof record[key] !== "string" || !allowed.includes(record[key] as T)) {
    throw new Error(`${label}.${key} must be one of: ${allowed.join(", ")}.`);
  }
}
