import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialContext } from "../core/context.ts";
import { LLMExecutor } from "../core/LLMExecutor.ts";
import { OpenAICompatibleLLMClient } from "../core/OpenAICompatibleLLMClient.ts";
import { StructuredOutputRepairer } from "../core/StructuredOutputRepairer.ts";
import type { AgentNode } from "../core/types.ts";
import { WorkflowGraph } from "../core/WorkflowGraph.ts";
import { WorkflowRuntime } from "../core/WorkflowRuntime.ts";
import { NodeRegistry } from "../core/NodeRegistry.ts";

describe("LLM security", () => {
  it("redacts API keys from thrown provider errors", async () => {
    const secret = "sk-test-secret-value";
    const client = new OpenAICompatibleLLMClient({
      apiKey: secret,
      model: "test",
      fetchFn: fakeFetch(new Response(`{"error":"Authorization: Bearer ${secret} apiKey=${secret}"}`, { status: 500 })),
    });

    await assert.rejects(
      () => client.generateStructured({
        role: "Planner",
        systemPrompt: "plan",
        input: {},
        outputSchemaName: "Plan",
        retryPolicy: { maxAttempts: 1 },
      }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.doesNotMatch(error.message, new RegExp(secret));
        assert.match(error.message, /REDACTED/);
        return true;
      },
    );
  });

  it("does not include API key in request metadata", async () => {
    let body = "";
    const client = new OpenAICompatibleLLMClient({
      apiKey: "secret-key",
      model: "test",
      fetchFn: (async (_input, init) => {
        body = String(init?.body ?? "");
        return providerResponse(JSON.stringify(validPlan()));
      }) as typeof fetch,
    });

    await client.generateStructured({
      role: "Planner",
      systemPrompt: "plan",
      input: {},
      outputSchemaName: "Plan",
      metadata: { nodeId: "planner" },
    });

    assert.doesNotMatch(body, /secret-key/);
    assert.doesNotMatch(body, /authorization/i);
  });

  it("does not write API key into trace summary on failure", async () => {
    const secret = "sk-trace-secret";
    const graph = new WorkflowGraph({
      workflow: { name: "secret-trace", start: "planner", maxIterations: 1 },
      nodes: [planNode()],
      edges: [{ from: "planner", to: "end", condition: { type: "always" } }],
    });
    const registry = new NodeRegistry();
    registry.register("llm", new LLMExecutor(new OpenAICompatibleLLMClient({
      apiKey: secret,
      model: "test",
      fetchFn: fakeFetch(new Response(`{"error":"token=${secret}"}`, { status: 500 })),
    })));

    const result = await new WorkflowRuntime(graph, registry).run(createInitialContext({ taskId: "test", userGoal: "goal" }));

    assert.doesNotMatch(JSON.stringify(result.trace), new RegExp(secret));
    assert.doesNotMatch(result.stopReason ?? "", new RegExp(secret));
  });

  it("truncates large raw output in repair prompts", () => {
    const prompt = StructuredOutputRepairer.buildRepairPrompt({
      outputSchemaName: "Plan",
      error: "Plan.steps must be an array.",
      rawOutput: "x".repeat(5_000),
      maxRawOutputChars: 100,
    });

    assert.ok(prompt.length < 2_000);
    assert.match(prompt, /truncated/);
  });

  it("does not include Authorization headers in repair prompts", () => {
    const prompt = StructuredOutputRepairer.buildRepairPrompt({
      outputSchemaName: "Plan",
      error: "Authorization: Bearer secret-token",
      rawOutput: '{"apiKey":"secret-token"}',
    });

    assert.doesNotMatch(prompt, /secret-token/);
    assert.match(prompt, /REDACTED/);
  });
});

function fakeFetch(response: Response): typeof fetch {
  return (async () => response) as typeof fetch;
}

function providerResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
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

function planNode(): AgentNode {
  return {
    id: "planner",
    type: "llm",
    role: "Planner",
    description: "plan",
    inputKeys: [],
    outputKey: "plan",
    outputSchema: "Plan",
    retryPolicy: { maxAttempts: 1 },
  };
}
