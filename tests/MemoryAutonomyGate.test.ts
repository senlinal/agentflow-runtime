import test from "node:test";
import assert from "node:assert/strict";
import { EscalationGate } from "../core/profile/EscalationGate.ts";
import { MemoryAutonomyGate } from "../core/profile/MemoryAutonomyGate.ts";
import type { CompactMemorySummary, TaskBrief } from "../core/types.ts";

test("MemoryAutonomyGate", async (t) => {
  await t.test("proceeds with assumptions when no compacted memory exists", () => {
    const decision = new MemoryAutonomyGate().evaluate({
      taskBrief: taskBrief("Summarize current RAG status"),
      compactMemory: null,
      dryRun: true,
    });

    assert.equal(decision.decision, "proceed_with_assumptions");
    assert.equal(decision.canProceed, true);
    assert.equal(decision.mustAskHuman, false);
    assert.match(decision.assumptions.join(" "), /No compacted memory/);
  });

  await t.test("asks human when compacted memory has high severity conflict", () => {
    const decision = new MemoryAutonomyGate().evaluate({
      taskBrief: taskBrief("Continue RAG optimization"),
      compactMemory: compactMemory({
        conflicts: [{
          conflictId: "conflict_scope",
          type: "confirmed_scope_conflict",
          severity: "high",
          summary: "Two active confirmed scopes disagree.",
          conflictingMemoryIds: ["memory_scope_a", "memory_scope_b"],
          recommendedResolution: "ask_human",
        }],
      }),
    });

    assert.equal(decision.decision, "ask_human");
    assert.equal(decision.canProceed, false);
    assert.equal(decision.mustAskHuman, true);
    assert.equal(decision.questionsToAsk[0].blocking, true);
    assert.equal(decision.referencedMemoryIds.includes("memory_scope_a"), true);
    assert.equal(decision.referencedMemoryIds.includes("memory_scope_b"), true);
  });

  await t.test("asks human for blocking open questions", () => {
    const decision = new MemoryAutonomyGate().evaluate({
      taskBrief: taskBrief("Improve retrieval"),
      compactMemory: compactMemory({
        openQuestions: [{
          id: "open_question_metric",
          question: "Which recall level should be optimized?",
          blocking: true,
          sourceMemoryIds: ["memory_question"],
        }],
      }),
    });

    assert.equal(decision.decision, "ask_human");
    assert.equal(decision.blockedReasons.some((reason) => /Blocking open question/.test(reason)), true);
    assert.equal(decision.referencedMemoryIds.includes("memory_question"), true);
  });

  await t.test("blocks rejected route repeats without new evidence", () => {
    const decision = new MemoryAutonomyGate().evaluate({
      taskBrief: taskBrief("Retry blocked workflow confirmed-scope-gate"),
      compactMemory: compactMemory({
        rejectedRoutes: [{
          routeId: "route_rejected",
          name: "Blocked workflow confirmed-scope-gate",
          reason: "Missing ScopeConfirmationRecord.",
          doNotRepeatWithoutNewEvidence: true,
          sourceMemoryIds: ["memory_rejected"],
        }],
      }),
      proposedAction: "Run Blocked workflow confirmed-scope-gate again",
    });

    assert.equal(decision.decision, "blocked");
    assert.equal(decision.canProceed, false);
    assert.equal(decision.mustAskHuman, false);
    assert.match(decision.blockedReasons.join(" "), /Rejected route/);
  });

  await t.test("EscalationGate blocks ask_human decisions", () => {
    const decision = new MemoryAutonomyGate().evaluate({
      taskBrief: taskBrief("Continue RAG optimization"),
      compactMemory: compactMemory({
        openQuestions: [{
          id: "open_question_metric",
          question: "Confirm metric.",
          blocking: true,
          sourceMemoryIds: ["memory_question"],
        }],
      }),
    });
    const escalation = new EscalationGate().evaluate(decision);

    assert.equal(escalation.shouldEscalate, true);
    assert.equal(escalation.shouldBlock, true);
    assert.equal(escalation.questionsToAsk.length, 1);
  });

  await t.test("proceeds when compacted memory has no blockers", () => {
    const decision = new MemoryAutonomyGate().evaluate({
      taskBrief: taskBrief("Summarize next RAG optimization step"),
      compactMemory: compactMemory(),
    });

    assert.equal(decision.decision, "proceed");
    assert.equal(decision.canProceed, true);
    assert.equal(decision.mustAskHuman, false);
  });
});

function taskBrief(goal: string): TaskBrief {
  return {
    taskId: "task_1",
    goal,
    currentState: "Profile-aware run.",
    constraints: [],
    resources: [],
    budget: "not specified",
    successCriteria: ["Return a decision."],
    nonGoals: [],
    rawUserInput: goal,
  };
}

function compactMemory(overrides: Partial<CompactMemorySummary> = {}): CompactMemorySummary {
  return {
    profileId: "rag-optimization",
    compactedAt: "2026-05-23T00:00:00.000Z",
    confirmedScope: {
      id: "confirmed_scope_1",
      title: "Confirmed RAG scope",
      summary: "Goal: improve RAG recall | Allowed modules: rag | Blocked actions: deploy, modify production index | Quality constraints: no answer regression",
      sourceMemoryIds: ["memory_scope"],
      allowedModules: ["rag"],
      forbiddenModules: ["production-index"],
      allowedActions: ["inspect_project", "evaluate_feasibility"],
      blockedActions: ["deploy", "modify production index"],
      qualityConstraints: ["no answer regression"],
    },
    currentFacts: [],
    activeDecisions: [],
    rejectedRoutes: [],
    candidateRoutes: [],
    openQuestions: [],
    resolvedQuestions: [],
    nextActions: [],
    conflicts: [],
    warnings: [],
    ...overrides,
  };
}
