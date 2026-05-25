import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expectedMapping = {
  Planner: "agentflow-planner",
  Debater: "agentflow-debater",
  PlannerRevision: "agentflow-planner-revision",
  Executor: "agentflow-executor",
  Verifier: "agentflow-verifier",
  GoalKeeper: "agentflow-goalkeeper",
};

test("OpenCode native subagent config", async (t) => {
  await t.test("declares role to OpenCode agent mapping", async () => {
    const mapping = JSON.parse(await readFile("config/opencode-subagents.json", "utf8")) as Record<string, string>;
    assert.deepEqual(mapping, expectedMapping);
  });

  await t.test("defines AgentFlow OpenCode subagents with safe permissions", async () => {
    for (const [role, agentName] of Object.entries(expectedMapping)) {
      const content = await readFile(`.opencode/agents/${agentName}.md`, "utf8");
      assert.match(content, /mode: subagent/);
      assert.match(content, new RegExp(`Role: ${role.replace("GoalKeeper", "GoalKeeper")}`));
      assert.match(content, /Input expectation:/);
      assert.match(content, /Output expectation:/);
      assert.match(content, /Forbidden actions:/);
      assert.match(content, /read \.env/);
      if (role !== "Executor") assert.match(content, /edit: deny/);
    }
  });

  await t.test("documents native dispatch limitation", async () => {
    const docs = await readFile("docs/OPENCODE_NATIVE_SUBAGENTS.md", "utf8");
    assert.match(docs, /OpenCode native subagent/);
    assert.match(docs, /AgentFlow internal subagent/);
    assert.match(docs, /programmatic dispatch/);
    assert.match(docs, /unavailable/);
    assert.match(docs, /openCodeTaskId/);
  });
});
