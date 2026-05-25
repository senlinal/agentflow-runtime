import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createInitialContext } from "../core/context.ts";
import { SubAgentArtifactStore } from "../core/subagent/SubAgentArtifactStore.ts";
import { SubAgentDispatcher } from "../core/subagent/SubAgentDispatcher.ts";
import type { AgentNode, SubAgentDispatchMetadata } from "../core/types.ts";
import { ProfileWorkflowRunner } from "../core/profile/ProfileWorkflowRunner.ts";

test("SubAgentDispatcher OpenCode mode", async (t) => {
  await t.test("hybrid mode writes internal artifacts and marks native dispatch unavailable", async () => {
    const runDir = join(tmpdir(), `agentflow-hybrid-dispatch-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const dispatcher = new SubAgentDispatcher(new SubAgentArtifactStore(runDir), {
      dispatchMode: "hybrid",
      runId: "run-1",
      runDir,
      profileId: "agent-workforce-opencode",
    });
    const context = createInitialContext({ taskId: "test", userGoal: "演示 OpenCode native subagents" });

    const handle = await dispatcher.start(plannerNode(), context, 0);
    const record = await dispatcher.complete(handle, { planId: "plan", summary: "demo plan" }, context);
    const metadata = JSON.parse(await readFile(record.metadataPath, "utf8")) as SubAgentDispatchMetadata;

    assert.equal(metadata.dispatchMode, "hybrid");
    assert.equal(metadata.internalSubAgentDispatched, true);
    assert.equal(metadata.openCodeNativeSubAgent, false);
    assert.equal(metadata.openCodeAgentName, "agentflow-planner");
    assert.equal(metadata.nativeDispatchStatus, "unavailable");
    assert.equal(metadata.openCodeTaskId, undefined);
    assert.equal(metadata.openCodeSessionId, undefined);
    assert.ok(metadata.nativeDispatchLimitations?.some((item) => item.includes("programmatic subagent dispatch API")));
    assert.ok(metadata.openCodeNativeDispatch?.inputPromptPath);
    assert.match(await readFile(metadata.outputArtifactPath ?? "", "utf8"), /demo plan/);
  });

  await t.test("agent-workforce-opencode timeline does not present internal subagents as native OpenCode tasks", async () => {
    const result = await new ProfileWorkflowRunner().run({
      profile: "agent-workforce-opencode",
      task: "演示 OpenCode native subagents",
    });
    const planner = result.roleTimeline.find((event) => event.role === "Planner");
    assert.ok(planner);
    assert.equal(planner.dispatchMode, "hybrid");
    assert.equal(planner.subAgentDispatched, true);
    assert.equal(planner.internalSubAgentDispatched, true);
    assert.equal(planner.openCodeNativeSubAgent, false);
    assert.equal(planner.openCodeAgentName, "agentflow-planner");
    assert.equal(planner.nativeDispatchStatus, "unavailable");
    assert.equal(planner.openCodeTaskId, undefined);
    assert.match(result.formattedText, /Role Timeline \/ OpenCode native subagent:/);
    assert.match(result.formattedText, /openCodeNativeSubAgent=false/);
  });
});

function plannerNode(): AgentNode {
  return {
    id: "planner",
    type: "mock",
    role: "Planner",
    description: "Plan answer",
    inputKeys: ["taskBrief"],
    outputKey: "plan",
    outputSchema: "Plan",
  };
}
