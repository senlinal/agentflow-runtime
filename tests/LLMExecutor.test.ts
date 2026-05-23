import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialContext } from "../core/context.ts";
import { LLMExecutor } from "../core/LLMExecutor.ts";
import type { LLMClient, LLMStructuredRequest, LLMStructuredResponse } from "../core/LLMClient.ts";
import { NodeRegistry } from "../core/NodeRegistry.ts";
import type { AgentNode } from "../core/types.ts";
import { WorkflowGraph } from "../core/WorkflowGraph.ts";
import { WorkflowRuntime } from "../core/WorkflowRuntime.ts";

describe("LLMExecutor", () => {
  it("executes llm nodes with a structured LLMClient response", async () => {
    const executor = new LLMExecutor(new StaticClient(validPlan()));
    const output = await executor.execute(planNode(), createInitialContext({ taskId: "test", userGoal: "goal" }));

    assert.equal((output as any).planId, "plan_1");
  });

  it("does not write invalid LLM output into context", async () => {
    const graph = new WorkflowGraph({
      workflow: { name: "llm-invalid", start: "planner", maxIterations: 1 },
      nodes: [planNode()],
      edges: [{ from: "planner", to: "end", condition: { type: "always" } }],
    });
    const registry = new NodeRegistry();
    registry.register("llm", new LLMExecutor(new StaticClient({ planId: "broken" })));

    const result = await new WorkflowRuntime(graph, registry).run(createInitialContext({ taskId: "test", userGoal: "goal" }));

    assert.equal(result.plan, null);
    assert.match(result.stopReason ?? "", /Plan\.summary must be a string/);
    assert.equal(result.trace.at(-1)?.error?.includes("Plan.summary must be a string."), true);
  });
});

class StaticClient implements LLMClient {
  private readonly output: unknown;

  constructor(output: unknown) {
    this.output = output;
  }

  async generateStructured<T>(_request: LLMStructuredRequest): Promise<LLMStructuredResponse<T>> {
    return {
      output: this.output as T,
      provider: "test",
      model: "test-model",
      attempts: 1,
    };
  }
}

function planNode(): AgentNode {
  return {
    id: "planner",
    type: "llm",
    role: "Planner",
    description: "plan",
    inputKeys: ["userGoal"],
    outputKey: "plan",
    outputSchema: "Plan",
  };
}

function validPlan() {
  return {
    planId: "plan_1",
    summary: "plan",
    steps: [{ id: "step_1", action: "do", expectedOutput: "done" }],
    risks: [],
    successCriteria: [],
    assumptions: [],
  };
}
