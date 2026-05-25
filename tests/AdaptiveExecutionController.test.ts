import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AdaptiveExecutionController } from "../core/adaptive/AdaptiveExecutionController.ts";
import type { WorkflowContext } from "../core/types.ts";
import { createInitialContext } from "../core/context.ts";

describe("AdaptiveExecutionController", () => {
  it("returns success when verifier passes", () => {
    const decision = new AdaptiveExecutionController().decide({
      ...baseContext(),
      verification: verifier(true),
      adaptiveState: {
        goalPlan: goalPlan(),
        attempts: [],
        decisions: [],
        currentAttemptNumber: 1,
        currentRouteId: "direct_deliverable",
        status: "attempting",
      },
    });

    assert.equal(decision.decision, "success");
  });

  it("retries a repairable verifier failure with an untried route", () => {
    const decision = new AdaptiveExecutionController().decide({
      ...baseContext(),
      verification: verifier(false, { isNotMetaOnly: false }),
      adaptiveState: {
        goalPlan: goalPlan(),
        attempts: [],
        decisions: [],
        currentAttemptNumber: 1,
        currentRouteId: "direct_deliverable",
        status: "attempting",
      },
    });

    assert.equal(decision.decision, "retry");
    assert.equal(decision.nextRouteId, "add_missing_content");
  });

  it("stops when maxAttempts is reached", () => {
    const decision = new AdaptiveExecutionController().decide({
      ...baseContext(),
      verification: verifier(false),
      adaptiveState: {
        goalPlan: { ...goalPlan(), maxAttempts: 2 },
        attempts: [{ attemptId: "attempt-001", attemptNumber: 1, routeId: "direct_deliverable", actionSummary: "x", inputArtifacts: [], outputArtifacts: [], resultSummary: "x", createdAt: new Date().toISOString() }],
        decisions: [],
        currentAttemptNumber: 2,
        currentRouteId: "add_missing_content",
        status: "attempting",
      },
    });

    assert.equal(decision.decision, "stop");
    assert.deepEqual(decision.blockedReasons, ["max_attempts_reached"]);
  });

  it("stops repeated routes", () => {
    const decision = new AdaptiveExecutionController().decide({
      ...baseContext(),
      verification: verifier(false),
      adaptiveState: {
        goalPlan: goalPlan(),
        attempts: [{ attemptId: "attempt-001", attemptNumber: 1, routeId: "direct_deliverable", actionSummary: "x", inputArtifacts: [], outputArtifacts: [], resultSummary: "x", createdAt: new Date().toISOString() }],
        decisions: [],
        currentAttemptNumber: 2,
        currentRouteId: "direct_deliverable",
        status: "attempting",
      },
    });

    assert.equal(decision.decision, "stop");
    assert.ok(decision.blockedReasons.includes("repeated_route"));
  });

  it("asks human for high-risk routes", () => {
    const decision = new AdaptiveExecutionController().decide({
      ...baseContext(),
      verification: verifier(false),
      adaptiveState: {
        goalPlan: {
          ...goalPlan(),
          riskBudget: "medium",
          candidateRoutes: [{ ...goalPlan().candidateRoutes[0], riskLevel: "high" }],
        },
        attempts: [],
        decisions: [],
        currentAttemptNumber: 1,
        currentRouteId: "direct_deliverable",
        status: "attempting",
      },
    });

    assert.equal(decision.decision, "ask_human");
    assert.deepEqual(decision.blockedReasons, ["high_risk"]);
  });
});

function baseContext(): WorkflowContext {
  return createInitialContext({ taskId: "task", userGoal: "explain coffee" });
}

function verifier(pass: boolean, overrides: Record<string, unknown> = {}) {
  return {
    pass,
    deliverableExists: pass,
    answersUserRequest: pass,
    isNotMetaOnly: pass,
    score: pass ? 0.97 : 0.3,
    failedCriteria: pass ? [] : ["Deliverable must not be workflow-only or meta-only."],
    reason: pass ? "ok" : "failed",
    nextAction: pass ? "end" as const : "replan" as const,
    feedbackToPlanner: pass ? "done" : "fix",
    ...overrides,
  };
}

function goalPlan() {
  return {
    planId: "goal-plan",
    goal: "explain coffee",
    successCriteria: ["answer"],
    candidateRoutes: [
      { routeId: "direct_deliverable", summary: "direct", expectedOutcome: "answer", costLevel: "low" as const, riskLevel: "low" as const, repairableFailureCodes: ["meta_only_output" as const] },
      { routeId: "add_missing_content", summary: "add", expectedOutcome: "answer", costLevel: "low" as const, riskLevel: "low" as const, repairableFailureCodes: ["meta_only_output" as const] },
    ],
    stopConditions: ["stop"],
    escalationConditions: ["ask"],
    maxAttempts: 3,
    costBudget: "medium" as const,
    riskBudget: "medium" as const,
    createdAt: new Date().toISOString(),
  };
}
