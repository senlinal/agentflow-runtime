import type {
  CorrectionHint,
  Critique,
  ExecutionResult,
  FeasibilityReport,
  OutputSchemaName,
  Plan,
  ResearchReport,
  RevisedPlan,
  SmokeTestResult,
  TaskBrief,
  VerificationReport,
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
  return record as VerificationReport;
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
