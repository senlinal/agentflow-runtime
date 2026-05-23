import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { NodeRegistry } from "../core/NodeRegistry.ts";
import { TaskBriefLoader } from "../core/TaskBriefLoader.ts";
import type { AgentNode, WorkflowContext, WorkflowGraphConfig } from "../core/types.ts";
import { WorkflowRunner } from "../core/WorkflowRunner.ts";

describe("LLM runtime metadata", () => {
  it("writes sanitized LLM warnings to workflow summary", async () => {
    const previousProvider = process.env.AGENTFLOW_LLM_PROVIDER;
    const previousModel = process.env.AGENTFLOW_DEEPSEEK_MODEL;
    const previousKey = process.env.AGENTFLOW_DEEPSEEK_API_KEY;
    process.env.AGENTFLOW_LLM_PROVIDER = "deepseek";
    process.env.AGENTFLOW_DEEPSEEK_MODEL = "deepseek-chat";
    process.env.AGENTFLOW_DEEPSEEK_API_KEY = "sk-test-secret";

    try {
      const registry = new NodeRegistry();
      registry.register("llm", {
        async execute(_node: AgentNode, _context: WorkflowContext) {
          return {
            planId: "plan_llm_metadata",
            summary: "metadata test plan",
            steps: [{ id: "step_1", action: "test", expectedOutput: "summary" }],
            risks: [],
            successCriteria: [],
            assumptions: [],
          };
        },
      });
      const taskBrief = await TaskBriefLoader.loadJson("inputs/feasible-task.json");
      const result = await new WorkflowRunner(registry).run(minimalLlmConfig(), taskBrief);
      const summary = await readFile(result.summaryPath, "utf8");

      assert.match(summary, /## LLM Config/);
      assert.match(summary, /deepseek-chat is legacy/);
      assert.equal(summary.includes("sk-test-secret"), false);
      assert.equal(summary.includes("reasoning_content"), false);
    } finally {
      restoreEnv("AGENTFLOW_LLM_PROVIDER", previousProvider);
      restoreEnv("AGENTFLOW_DEEPSEEK_MODEL", previousModel);
      restoreEnv("AGENTFLOW_DEEPSEEK_API_KEY", previousKey);
    }
  });
});

function minimalLlmConfig(): WorkflowGraphConfig {
  return {
    workflow: {
      name: "llm-metadata-test",
      version: "1.0.0",
      start: "planner",
      maxIterations: 2,
    },
    nodes: [{
      id: "planner",
      type: "llm",
      role: "Planner",
      description: "Create a plan.",
      inputKeys: ["taskBrief"],
      outputKey: "plan",
      outputSchema: "Plan",
    }],
    edges: [{ from: "planner", to: "end", condition: { type: "always" } }],
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
