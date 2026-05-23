import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialContext } from "../core/context.ts";
import { MockLLMClient } from "../core/MockLLMClient.ts";

describe("MockLLMClient", () => {
  it("Planner returns a Plan", async () => {
    const client = new MockLLMClient();
    const planResponse = await client.generateStructured<any>({
      role: "Planner",
      systemPrompt: "plan",
      input: {},
      outputSchemaName: "Plan",
      context: createInitialContext({ taskId: "test", userGoal: "build runtime" }),
    });

    assert.equal(typeof planResponse.output.planId, "string");
    assert.equal(Array.isArray(planResponse.output.steps), true);
    assert.equal(typeof planResponse.output.steps[0].action, "string");
  });

  it("Verifier returns pass=false on first call and pass=true on second call", async () => {
    const client = new MockLLMClient();
    const context = createInitialContext({ taskId: "test", userGoal: "build runtime" });
    const firstResponse = await client.generateStructured<any>({
      role: "Verifier",
      systemPrompt: "verify",
      input: {},
      outputSchemaName: "VerificationReport",
      context,
    });
    const secondResponse = await client.generateStructured<any>({
      role: "Verifier",
      systemPrompt: "verify",
      input: {},
      outputSchemaName: "VerificationReport",
      context,
    });

    assert.equal(firstResponse.output.pass, false);
    assert.equal(secondResponse.output.pass, true);
  });

  it("GoalKeeper returns a CorrectionHint", async () => {
    const client = new MockLLMClient();
    const hintResponse = await client.generateStructured<any>({
      role: "GoalKeeper",
      systemPrompt: "keep goal",
      input: {},
      outputSchemaName: "CorrectionHint",
      context: createInitialContext({ taskId: "test", userGoal: "build runtime" }),
    });

    assert.equal(typeof hintResponse.output.driftDetected, "boolean");
    assert.equal(Array.isArray(hintResponse.output.correctionInstructions), true);
    assert.equal(hintResponse.output.recommendedNextAction, "replan");
  });

  it("Researcher returns a ResearchReport", async () => {
    const client = new MockLLMClient();
    const reportResponse = await client.generateStructured<any>({
      role: "Researcher",
      systemPrompt: "research",
      input: {},
      outputSchemaName: "ResearchReport",
      context: {
        ...createInitialContext({ taskId: "test", userGoal: "build runtime" }),
        taskBrief: feasibleBrief(),
      },
    });

    assert.equal(typeof reportResponse.output.summary, "string");
    assert.equal(Array.isArray(reportResponse.output.knownFacts), true);
  });

  it("FeasibilityEvaluator returns proceed decision for feasible scenario", async () => {
    const client = new MockLLMClient();
    const reportResponse = await client.generateStructured<any>({
      role: "FeasibilityEvaluator",
      systemPrompt: "feasibility",
      input: {},
      outputSchemaName: "FeasibilityReport",
      context: {
        ...createInitialContext({ taskId: "test", userGoal: feasibleBrief().goal }),
        taskBrief: feasibleBrief(),
      },
    });

    assert.ok(["proceed", "proceed_with_risks"].includes(reportResponse.output.decision));
    assert.ok(["low", "medium"].includes(reportResponse.output.costLevel));
    assert.ok(["low", "medium"].includes(reportResponse.output.riskLevel));
  });

  it("FeasibilityEvaluator returns non-proceed decision for infeasible scenario", async () => {
    const client = new MockLLMClient();
    const reportResponse = await client.generateStructured<any>({
      role: "FeasibilityEvaluator",
      systemPrompt: "feasibility",
      input: {},
      outputSchemaName: "FeasibilityReport",
      context: {
        ...createInitialContext({ taskId: "test", userGoal: infeasibleBrief().goal }),
        taskBrief: infeasibleBrief(),
      },
    });

    assert.ok(["ask_human", "revise_goal", "stop"].includes(reportResponse.output.decision));
    assert.equal(reportResponse.output.costLevel === "high" || reportResponse.output.riskLevel === "high", true);
  });

  it("returns a SmokeTestResult for smoke test schema", async () => {
    const client = new MockLLMClient();
    const response = await client.generateStructured<any>({
      role: "Executor",
      systemPrompt: "smoke",
      input: {},
      outputSchemaName: "SmokeTestResult",
    });

    assert.equal(response.output.ok, true);
    assert.equal(response.output.provider, "mock");
    assert.equal(response.output.model, "mock-structured");
  });
});

function feasibleBrief() {
  return {
    taskId: "task_feasible",
    goal: "基于当前已完成的配置驱动 Runtime，增加可复用 workflow template 和 feasibility gate。",
    currentState: "Runtime exists.",
    constraints: [],
    resources: [],
    budget: "medium",
    successCriteria: [],
    nonGoals: [],
  };
}

function infeasibleBrief() {
  return {
    taskId: "task_infeasible",
    goal: "三天内完成一个完整 Dify 替代品，包括复杂 UI、多人协作、插件市场、权限系统、真实 LLM 接入和部署平台。",
    currentState: "Only CLI runtime exists.",
    constraints: [],
    resources: [],
    budget: "low",
    successCriteria: [],
    nonGoals: [],
  };
}
