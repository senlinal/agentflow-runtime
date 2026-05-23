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
