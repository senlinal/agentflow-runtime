import type { OutputSchemaName } from "./types.ts";

export const OUTPUT_SCHEMA_NAMES: OutputSchemaName[] = [
  "TaskBrief",
  "ResearchReport",
  "FeasibilityReport",
  "Plan",
  "Critique",
  "RevisedPlan",
  "ExecutionResult",
  "VerificationReport",
  "CorrectionHint",
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
        currentState: "string",
        constraints: ["string"],
        resources: ["string"],
        budget: "string",
        successCriteria: ["string"],
        nonGoals: ["string"],
        rawUserInput: "string optional",
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
        steps: [{ id: "string", action: "string", expectedOutput: "string" }],
        risks: ["string"],
        successCriteria: ["string"],
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
        completedSteps: ["string"],
        artifacts: ["string"],
        summary: "string",
        errors: ["string"],
        rawOutput: "string",
      };
    case "VerificationReport":
      return {
        pass: "boolean",
        score: "number",
        failedCriteria: ["string"],
        reason: "string",
        nextAction: "end | replan | retry_execute | ask_human",
        feedbackToPlanner: "string",
      };
    case "CorrectionHint":
      return {
        driftDetected: "boolean",
        originalGoalReminder: "string",
        failedCriteria: ["string"],
        correctionInstructions: ["string"],
        recommendedNextAction: "replan | retry_execute | ask_human",
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
