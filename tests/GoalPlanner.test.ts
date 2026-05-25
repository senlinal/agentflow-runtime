import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GoalPlanner } from "../core/adaptive/GoalPlanner.ts";
import type { TaskBrief } from "../core/types.ts";

describe("GoalPlanner", () => {
  it("creates a goal plan with criteria, candidate routes, stop conditions, and escalation conditions", () => {
    const plan = new GoalPlanner().plan({ taskBrief: taskBrief("解释一下咖啡的做法", "general_answer") });

    assert.equal(plan.goal, "解释一下咖啡的做法");
    assert.equal(plan.maxAttempts, 3);
    assert.ok(plan.successCriteria.some((item) => /directly answers/i.test(item)));
    assert.ok(plan.candidateRoutes.length >= 2);
    assert.ok(plan.stopConditions.some((item) => /Maximum attempts/i.test(item)));
    assert.ok(plan.escalationConditions.some((item) => /cost|risk/i.test(item)));
  });

  it("adds RAG-specific recall and answer-quality criteria", () => {
    const plan = new GoalPlanner().plan({ taskBrief: taskBrief("优化 RAG 召回", "rag_optimization") });

    assert.ok(plan.successCriteria.some((item) => /recall/i.test(item)));
    assert.ok(plan.successCriteria.some((item) => /answer quality/i.test(item)));
    assert.ok(plan.candidateRoutes.some((route) => route.routeId === "diagnose_recall"));
  });
});

function taskBrief(userRequest: string, taskType: TaskBrief["taskType"]): TaskBrief {
  return {
    taskId: "task-test",
    goal: userRequest,
    userRequest,
    taskType,
    expectedDeliverable: { type: taskType === "rag_optimization" ? "experiment_plan" : "answer", description: "test deliverable" },
    currentState: "test",
    constraints: [],
    resources: [],
    budget: "local",
    successCriteria: ["Directly answer the user's request."],
    nonGoals: [],
    rawUserInput: userRequest,
  };
}
