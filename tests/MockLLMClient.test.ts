import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialContext } from "../core/context.ts";
import { MockLLMClient } from "../core/MockLLMClient.ts";
import type { TaskBrief } from "../core/types.ts";

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

  it("TaskNegotiator returns a TaskNegotiationResult", async () => {
    const client = new MockLLMClient();
    const response = await client.generateStructured<any>({
      role: "TaskNegotiator",
      systemPrompt: "negotiate",
      input: {},
      outputSchemaName: "TaskNegotiationResult",
      context: {
        ...createInitialContext({ taskId: "test", userGoal: feasibleBrief().goal }),
        taskBrief: feasibleBrief(),
      },
    });

    assert.equal(typeof response.output.negotiationId, "string");
    assert.ok(["ask_human", "proceed_to_feasibility", "split_task", "stop"].includes(response.output.recommendedNextStep));
    assert.ok(response.output.proposedScope.blockedActions.includes("execute_code"));
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

  it("Executor produces answer deliverable content for coffee task", async () => {
    const client = new MockLLMClient();
    const brief = coffeeBrief();
    const response = await client.generateStructured<any>({
      role: "Executor",
      systemPrompt: "execute",
      input: {},
      outputSchemaName: "ExecutionResult",
      context: {
        ...createInitialContext({
          taskId: brief.taskId,
          userGoal: brief.goal,
          successCriteria: brief.successCriteria,
        }),
        taskBrief: brief,
      },
    });

    assert.equal(response.output.deliverable.type, "answer");
    assert.match(response.output.deliverable.content, /咖啡豆|咖啡粉/);
    assert.match(response.output.deliverable.content, /步骤|闷蒸|萃取/);
    assert.notEqual(response.output.deliverable.content.trim(), "");
  });

  it("Verifier fails meta-only answer deliverables", async () => {
    const client = new MockLLMClient();
    const brief = coffeeBrief();
    const response = await client.generateStructured<any>({
      role: "Verifier",
      systemPrompt: "verify",
      input: {},
      outputSchemaName: "VerificationReport",
      context: {
        ...createInitialContext({
          taskId: brief.taskId,
          userGoal: brief.goal,
          successCriteria: brief.successCriteria,
        }),
        taskBrief: brief,
        executionResult: {
          status: "success",
          deliverable: {
            type: "answer",
            content: "我已经成功执行计划，提供了关于咖啡做法的解释。",
          },
          evidenceOfCompletion: [],
          limitations: [],
          completedSteps: ["produce_deliverable"],
          artifacts: [],
          summary: "done",
          errors: [],
          rawOutput: "{}",
        },
      },
    });

    assert.equal(response.output.pass, false);
    assert.equal(response.output.isNotMetaOnly, false);
    assert.equal(response.output.answersUserRequest, false);
  });
});

function feasibleBrief() {
  return {
    taskId: "task_feasible",
    goal: "基于当前已完成的配置驱动 Runtime，增加可复用 workflow template 和 feasibility gate。",
    userRequest: "基于当前已完成的配置驱动 Runtime，增加可复用 workflow template 和 feasibility gate。",
    taskType: "unknown",
    expectedDeliverable: { type: "workflow_demo", description: "Structured runtime work." },
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
    userRequest: "三天内完成一个完整 Dify 替代品，包括复杂 UI、多人协作、插件市场、权限系统、真实 LLM 接入和部署平台。",
    taskType: "unknown",
    expectedDeliverable: { type: "workflow_demo", description: "Structured runtime work." },
    currentState: "Only CLI runtime exists.",
    constraints: [],
    resources: [],
    budget: "low",
    successCriteria: [],
    nonGoals: [],
  };
}

function coffeeBrief(): TaskBrief {
  return {
    taskId: "task_coffee",
    goal: "解释一下咖啡的做法",
    userRequest: "解释一下咖啡的做法",
    taskType: "general_answer",
    expectedDeliverable: {
      type: "answer",
      description: "A clear explanation of how to make coffee.",
    },
    answerRequirements: [
      "materials/tools",
      "step-by-step process",
      "tips or cautions",
      "concise summary",
    ],
    contentQualityCriteria: ["specific", "non-meta"],
    currentState: "test",
    constraints: [],
    resources: [],
    budget: "local mock",
    successCriteria: [
      "Directly answer the user's request.",
      "Include concrete useful content.",
      "Do not only describe the workflow process.",
      "Avoid empty meta statements.",
    ],
    nonGoals: [],
  };
}
