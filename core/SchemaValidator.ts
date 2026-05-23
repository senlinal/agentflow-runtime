import type {
  CorrectionHint,
  Critique,
  ExecutionResult,
  FeasibilityReport,
  OutputSchemaName,
  Plan,
  ResearchReport,
  RevisedPlan,
  ScopedRepairPlan,
  SmokeTestResult,
  TaskBrief,
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
      case "CorrectionHint":
        return validateCorrectionHint(output);
      case "SmokeTestResult":
        return validateSmokeTestResult(output);
      default:
        throw new Error(`Unsupported output schema: ${String(schemaName)}`);
    }
  }
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
