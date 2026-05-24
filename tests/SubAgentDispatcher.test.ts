import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createInitialContext } from "../core/context.ts";
import { SubAgentArtifactStore } from "../core/subagent/SubAgentArtifactStore.ts";
import { SubAgentDispatcher } from "../core/subagent/SubAgentDispatcher.ts";
import type { AgentNode, SubAgentDispatchMetadata } from "../core/types.ts";

test("SubAgentDispatcher", async (t) => {
  await t.test("records completed LLM call metadata as LLM-backed evidence", async () => {
    const runDir = join(tmpdir(), `agentflow-subagent-dispatch-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const dispatcher = new SubAgentDispatcher(new SubAgentArtifactStore(runDir));
    const context = createInitialContext({ taskId: "test", userGoal: "解释一下咖啡的做法" });
    context.runtimeMetadata = {
      llmCalls: [{
        nodeId: "planner",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        success: true,
      }],
    };

    const handle = await dispatcher.start(llmPlannerNode(), context, 0);
    const record = await dispatcher.complete(handle, { planId: "plan", summary: "coffee plan" }, context);
    const metadata = JSON.parse(await readFile(record.metadataPath, "utf8")) as SubAgentDispatchMetadata;

    assert.equal(metadata.executorType, "llm");
    assert.equal(metadata.isMock, false);
    assert.equal(metadata.isLLMBacked, true);
    assert.equal(metadata.modelProvider, "deepseek");
    assert.equal(metadata.modelName, "deepseek-v4-flash");
    assert.equal(metadata.callStatus, "completed");
  });

  await t.test("does not mark an llm node as LLM-backed without an LLM call record", async () => {
    const runDir = join(tmpdir(), `agentflow-subagent-no-call-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const dispatcher = new SubAgentDispatcher(new SubAgentArtifactStore(runDir));
    const context = createInitialContext({ taskId: "test", userGoal: "解释一下咖啡的做法" });

    const handle = await dispatcher.start(llmPlannerNode(), context, 0);
    const record = await dispatcher.complete(handle, { planId: "plan", summary: "coffee plan" }, context);
    const metadata = JSON.parse(await readFile(record.metadataPath, "utf8")) as SubAgentDispatchMetadata;

    assert.equal(metadata.executorType, "llm");
    assert.equal(metadata.isLLMBacked, false);
    assert.equal(metadata.modelProvider, undefined);
    assert.equal(metadata.callStatus, undefined);
  });
});

function llmPlannerNode(): AgentNode {
  return {
    id: "planner",
    type: "llm",
    role: "Planner",
    description: "Plan answer",
    inputKeys: ["taskBrief"],
    outputKey: "plan",
    outputSchema: "Plan",
  };
}
