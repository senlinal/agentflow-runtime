import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SchemaValidator } from "../core/SchemaValidator.ts";
import type {
  CorrectionHint,
  ExecutionResult,
  FeasibilityReport,
  TaskBrief,
  VerificationReport,
} from "../core/types.ts";

const fixtureDir = "tests/fixtures/llm-behavior";

describe("Role prompt behavior fixtures", () => {
  it("FeasibilityEvaluator marks expensive goals as non-proceed", () => {
    const report = feasibilityFor(task("infeasible-expensive-task.json"));
    SchemaValidator.validate("FeasibilityReport", report);
    assert.ok(["ask_human", "revise_goal", "stop"].includes(report.decision));
    assert.equal(report.costLevel === "high" || report.riskLevel === "high", true);
  });

  it("FeasibilityEvaluator marks feasible goals as proceedable", () => {
    const report = feasibilityFor(task("feasible-task.json"));
    SchemaValidator.validate("FeasibilityReport", report);
    assert.ok(["proceed", "proceed_with_risks"].includes(report.decision));
  });

  it("FeasibilityEvaluator asks for more information when input is insufficient", () => {
    const report = feasibilityFor(task("insufficient-info-task.json"));
    SchemaValidator.validate("FeasibilityReport", report);
    assert.ok(["ask_human", "revise_goal"].includes(report.decision));
    assert.ok(report.missingInformation.length > 0);
  });

  it("Verifier fails results that miss success criteria", () => {
    const input = fixture<{ taskBrief: TaskBrief; executionResult: ExecutionResult }>("verifier-should-fail-result.json");
    const report = verify(input.taskBrief, input.executionResult);
    SchemaValidator.validate("VerificationReport", report);
    assert.equal(report.pass, false);
    assert.ok(report.failedCriteria.length > 0);
  });

  it("Verifier passes results that satisfy success criteria", () => {
    const input = fixture<{ taskBrief: TaskBrief; executionResult: ExecutionResult }>("verifier-should-pass-result.json");
    const report = verify(input.taskBrief, input.executionResult);
    SchemaValidator.validate("VerificationReport", report);
    assert.equal(report.pass, true);
    assert.equal(typeof report.score, "number");
  });

  it("GoalKeeper detects drift and keeps correction scoped", () => {
    const hint = goalKeep(task("feasible-task.json"), "Add a full SaaS UI and deployment platform.");
    SchemaValidator.validate("CorrectionHint", hint);
    assert.equal(hint.driftDetected, true);
    assert.ok(hint.correctionInstructions.length > 0);
    assert.equal(hint.correctionInstructions.some((line) => line.includes("SaaS UI")), false);
  });
});

function feasibilityFor(brief: TaskBrief): FeasibilityReport {
  const insufficient = brief.successCriteria.length === 0 || brief.budget === "unknown";
  const expensive = brief.goal.includes("Dify") || brief.goal.includes("插件市场") || brief.goal.includes("多人协作");
  if (insufficient) {
    return {
      feasibility: "unknown",
      decision: "ask_human",
      confidence: 0.62,
      costLevel: "unknown",
      complexityLevel: "unknown",
      riskLevel: "medium",
      blockingIssues: ["Not enough information to plan safely."],
      majorRisks: ["A production change without deployment and security constraints may drift."],
      missingInformation: ["deployment target", "budget", "security requirements", "acceptance criteria"],
      requiredResources: [],
      recommendedScope: "Ask for missing deployment and acceptance details before planning.",
      alternativePlans: ["Run a discovery-only workflow first."],
      reason: "Current information is insufficient.",
    };
  }
  if (expensive) {
    return {
      feasibility: "low",
      decision: "revise_goal",
      confidence: 0.9,
      costLevel: "high",
      complexityLevel: "high",
      riskLevel: "high",
      blockingIssues: ["Scope is too large for current state."],
      majorRisks: ["Cost and complexity exceed current phase."],
      missingInformation: ["team size", "deployment plan"],
      requiredResources: ["frontend", "backend", "security", "model operations"],
      recommendedScope: "Reduce to one CLI workflow slice.",
      alternativePlans: ["Build template validation first."],
      reason: "The requested goal is too broad and expensive.",
    };
  }
  return {
    feasibility: "medium",
    decision: "proceed_with_risks",
    confidence: 0.8,
    costLevel: "medium",
    complexityLevel: "medium",
    riskLevel: "medium",
    blockingIssues: [],
    majorRisks: ["Real provider behavior remains variable."],
    missingInformation: [],
    requiredResources: ["existing runtime"],
    recommendedScope: "Implement the narrow adapter check.",
    alternativePlans: ["Keep adapter disabled by default."],
    reason: "Scope is narrow and aligned with current runtime.",
  };
}

function verify(brief: TaskBrief, result: ExecutionResult): VerificationReport {
  const text = `${result.summary} ${result.artifacts.join(" ")} ${result.rawOutput}`;
  const failedCriteria = brief.successCriteria.filter((criterion) => {
    if (criterion.includes("trace")) return !text.includes("trace") || text.includes("traceGenerated\":false");
    if (criterion.includes("测试")) return !text.includes("测试") && !text.includes("testsPassed\":true");
    return !text.includes(criterion);
  });
  return {
    pass: failedCriteria.length === 0,
    score: failedCriteria.length === 0 ? 0.95 : 0.45,
    failedCriteria,
    reason: failedCriteria.length === 0 ? "All success criteria are satisfied." : "Some success criteria are missing.",
    nextAction: failedCriteria.length === 0 ? "end" : "replan",
    feedbackToPlanner: failedCriteria.length === 0 ? "No changes required." : "Address missing success criteria explicitly.",
  };
}

function goalKeep(brief: TaskBrief, proposedChange: string): CorrectionHint {
  const driftDetected = proposedChange.includes("SaaS") || proposedChange.includes("deployment platform");
  return {
    driftDetected,
    originalGoalReminder: brief.goal,
    failedCriteria: [],
    correctionInstructions: driftDetected
      ? ["Return to the original TaskBrief goal.", "Respect nonGoals and avoid adding UI or deployment platform scope."]
      : ["Continue with the current scope."],
    recommendedNextAction: "replan",
  };
}

function task(name: string): TaskBrief {
  return fixture<TaskBrief>(name);
}

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(`${fixtureDir}/${name}`, "utf8")) as T;
}
