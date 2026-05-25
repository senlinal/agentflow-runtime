import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { OpenCodeSubAgentBridge } from "../core/opencode/OpenCodeSubAgentBridge.ts";

test("OpenCodeSubAgentBridge", async (t) => {
  await t.test("maps AgentFlow roles to OpenCode agent names", async () => {
    const fixture = await createFixture();
    const bridge = new OpenCodeSubAgentBridge(fixture.mappingPath, fixture.agentsDir);
    const status = await bridge.inspectConfig();

    assert.equal(status.configuredAgents.find((agent) => agent.role === "Planner")?.openCodeAgentName, "agentflow-planner");
    assert.equal(status.configuredAgents.find((agent) => agent.role === "GoalKeeper")?.openCodeAgentName, "agentflow-goalkeeper");
    assert.equal(status.programmaticDispatchSupported, false);
  });

  await t.test("records unavailable native dispatch without fabricating task ids", async () => {
    const fixture = await createFixture();
    const runDir = join(fixture.root, "run");
    const bridge = new OpenCodeSubAgentBridge(fixture.mappingPath, fixture.agentsDir);
    const result = await bridge.dispatch({
      runId: "run-1",
      runDir,
      nodeId: "planner",
      role: "Planner",
      inputKeys: ["taskBrief"],
      outputKey: "plan",
      outputSchema: "Plan",
      contextPacket: { taskBrief: { goal: "解释 RAG 流程" } },
      profileId: "agent-workforce-opencode",
    });

    assert.equal(result.status, "unavailable");
    assert.equal(result.openCodeAgentName, "agentflow-planner");
    assert.equal(result.openCodeTaskId, undefined);
    assert.equal(result.openCodeSessionId, undefined);
    assert.match(result.limitations.join("\n"), /programmatic subagent dispatch API/);
    assert.match(await readFile(result.inputPromptPath, "utf8"), /@agentflow-planner/);
  });
});

async function createFixture(): Promise<{ root: string; mappingPath: string; agentsDir: string }> {
  const root = join(tmpdir(), `agentflow-opencode-bridge-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const agentsDir = join(root, ".opencode", "agents");
  await mkdir(agentsDir, { recursive: true });
  const mappingPath = join(root, "opencode-subagents.json");
  await writeFile(mappingPath, JSON.stringify({
    Planner: "agentflow-planner",
    GoalKeeper: "agentflow-goalkeeper",
  }, null, 2));
  await writeFile(join(agentsDir, "agentflow-planner.md"), "---\nmode: subagent\n---\nPlanner\n");
  await writeFile(join(agentsDir, "agentflow-goalkeeper.md"), "---\nmode: subagent\n---\nGoalKeeper\n");
  return { root, mappingPath, agentsDir };
}
