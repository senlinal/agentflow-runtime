import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialContext } from "../core/context.ts";
import { NodeRegistry } from "../core/NodeRegistry.ts";
import type { AgentNode, NodeExecutor, WorkflowContext } from "../core/types.ts";
import { WorkflowGraph } from "../core/WorkflowGraph.ts";
import { WorkflowLoader } from "../core/WorkflowLoader.ts";
import { WorkflowRuntime } from "../core/WorkflowRuntime.ts";

describe("WorkflowRuntime", () => {
  it("executes the full configured workflow", async () => {
    const graph = await WorkflowLoader.loadJson("examples/demo-workflow.json");
    const runtime = new WorkflowRuntime(graph, NodeRegistry.withDefaults());
    const result = await runtime.run(baseContext());

    assert.equal(result.verification?.pass, true);
    assert.ok(result.plan);
    assert.ok(result.critique);
    assert.ok(result.revisedPlan);
    assert.ok(result.executionResult);
    assert.ok(result.verification);
    assert.deepEqual(result.trace.map((item) => item.nodeId), [
      "planner",
      "debater",
      "planner_revision",
      "executor",
      "verifier",
      "goal_keeper",
      "planner_revision",
      "executor",
      "verifier",
    ]);
  });

  it("goes to end when verifier pass=true", async () => {
    const graph = await WorkflowLoader.loadJson("examples/demo-workflow.json");
    const registry = new NodeRegistry();
    registry.register("mock", new ImmediatePassExecutor());
    const result = await new WorkflowRuntime(graph, registry).run(baseContext());

    assert.equal(result.verification?.pass, true);
    assert.equal(result.trace.at(-1)?.nodeId, "verifier");
    assert.equal(result.trace.at(-1)?.nextNode, "end");
    assert.equal(result.trace.some((item) => item.nodeId === "goal_keeper"), false);
  });

  it("routes to goalkeeper when verifier pass=false", async () => {
    const graph = await WorkflowLoader.loadJson("examples/demo-workflow.json");
    const result = await new WorkflowRuntime(graph, NodeRegistry.withDefaults()).run(baseContext());

    const verifierFailure = result.trace.find((item) => item.nodeId === "verifier" && item.nextNode === "goal_keeper");
    assert.ok(verifierFailure);
    assert.equal(verifierFailure.conditionResults.some((condition) => condition.matched), true);
    assert.ok(verifierFailure.nextNode);
  });

  it("maxIterations prevents infinite loops", async () => {
    const graph = new WorkflowGraph({
      workflow: { name: "loop-test", start: "planner", maxIterations: 1 },
      nodes: [
        node("planner", "Planner", "plan", "Plan"),
        node("verifier", "Verifier", "verification", "VerificationReport"),
      ],
      edges: [
        { from: "planner", to: "verifier", condition: { type: "always" } },
        { from: "verifier", to: "planner", condition: { type: "always" } },
      ],
    });
    const registry = new NodeRegistry();
    registry.register("mock", new AlwaysLoopExecutor());

    const result = await new WorkflowRuntime(graph, registry).run(baseContext());
    assert.equal(result.stopReason, "Stopped because maxIterations=1 was reached.");
    assert.equal(result.trace.at(-1)?.nextNode, "end");
  });

  it("feasible workflow enters Planner and Executor", async () => {
    const graph = await WorkflowLoader.loadJson("examples/research-feasibility-workflow.json");
    const result = await new WorkflowRuntime(graph, NodeRegistry.withDefaults()).run({
      ...baseContext(),
      taskBrief: feasibleBrief(),
    });
    const nodeIds = result.trace.map((item) => item.nodeId);

    assert.ok(nodeIds.includes("researcher"));
    assert.ok(nodeIds.includes("feasibility"));
    assert.ok(nodeIds.includes("planner"));
    assert.ok(nodeIds.includes("executor"));
    assert.ok(result.taskBrief);
    assert.ok(result.researchReport);
    assert.ok(result.feasibilityReport);
    assert.ok(result.trace.find((item) => item.nodeId === "feasibility")?.nextNode);
    assert.ok(graph.defaultPolicies);
  });

  it("infeasible workflow stops before Planner and Executor", async () => {
    const graph = await WorkflowLoader.loadJson("examples/research-feasibility-workflow.json");
    const result = await new WorkflowRuntime(graph, NodeRegistry.withDefaults()).run({
      ...baseContext(),
      userGoal: infeasibleBrief().goal,
      taskBrief: infeasibleBrief(),
    });
    const nodeIds = result.trace.map((item) => item.nodeId);

    assert.ok(nodeIds.includes("researcher"));
    assert.ok(nodeIds.includes("feasibility"));
    assert.equal(nodeIds.includes("planner"), false);
    assert.equal(nodeIds.includes("executor"), false);
    assert.ok(result.taskBrief);
    assert.ok(result.researchReport);
    assert.ok(result.feasibilityReport);
    assert.ok(["ask_human", "revise_goal", "stop"].includes(result.feasibilityReport.decision));
  });
});

function baseContext(): WorkflowContext {
  return createInitialContext({
    taskId: "test",
    userGoal: "test composable workflow",
    successCriteria: ["runtime executes configured graph"],
  });
}

function feasibleBrief() {
  return {
    taskId: "task_feasible",
    goal: "基于当前已完成的配置驱动 Runtime，增加可复用 workflow template 和 feasibility gate。",
    currentState: "Runtime exists.",
    constraints: [],
    resources: [],
    budget: "medium",
    successCriteria: ["execute if feasible"],
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
    successCriteria: ["do not blindly execute"],
    nonGoals: [],
  };
}

function node(
  id: string,
  role: AgentNode["role"],
  outputKey: AgentNode["outputKey"],
  outputSchema: AgentNode["outputSchema"],
): AgentNode {
  return {
    id,
    type: "mock",
    role,
    description: id,
    inputKeys: [],
    outputKey,
    outputSchema,
  };
}

class ImmediatePassExecutor implements NodeExecutor {
  async execute(node: AgentNode): Promise<unknown> {
    if (node.outputKey === "verification") {
      return {
        pass: true,
        score: 1,
        failedCriteria: [],
        reason: "pass",
        nextAction: "end",
        feedbackToPlanner: "done",
      };
    }
    return outputFor(node);
  }
}

class AlwaysLoopExecutor implements NodeExecutor {
  async execute(node: AgentNode): Promise<unknown> {
    if (node.outputKey === "verification") {
      return {
        pass: false,
        score: 0,
        failedCriteria: ["loop"],
        reason: "loop",
        nextAction: "replan",
        feedbackToPlanner: "loop",
      };
    }
    return outputFor(node);
  }
}

function outputFor(node: AgentNode): unknown {
  switch (node.outputKey) {
    case "plan":
      return {
        planId: "plan_test",
        summary: "plan",
        steps: [{ id: "step_1", action: "do work", expectedOutput: "done" }],
        risks: [],
        successCriteria: [],
        assumptions: [],
      };
    case "critique":
      return { issues: [], risks: [], missingRequirements: [], suggestions: [], severity: "low" };
    case "revisedPlan":
      return {
        planId: "revised_test",
        summary: "revised",
        steps: [{ id: "step_1", action: "do work", expectedOutput: "done" }],
        risks: [],
        successCriteria: [],
        assumptions: [],
        basedOnCritique: [],
        revisionNotes: [],
      };
    case "executionResult":
      return { completedSteps: [], artifacts: [], summary: "done", errors: [], rawOutput: "{}" };
    case "correctionHint":
      return {
        driftDetected: false,
        originalGoalReminder: "goal",
        failedCriteria: [],
        correctionInstructions: ["hint"],
        recommendedNextAction: "replan",
      };
    default:
      return null;
  }
}
