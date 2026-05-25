import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { NativeSubAgentWorkflowPackBuilder } from "../core/opencode/NativeSubAgentWorkflowPackBuilder.ts";

test("NativeSubAgentWorkflowPackBuilder", async (t) => {
  await t.test("generates a manifest, dispatch file, prompts, inputs, and schemas", async () => {
    const baseRunDir = join(tmpdir(), `agentflow-native-pack-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const pack = await new NativeSubAgentWorkflowPackBuilder().build({
      profileId: "agent-workforce-basic",
      task: "解释一下咖啡的做法",
      baseRunDir,
    });

    assert.equal(pack.profileId, "agent-workforce-basic");
    assert.equal(pack.tasks.length, 5);
    assert.ok(pack.manifestPath);
    assert.match(await readFile(pack.dispatchInstructionsPath, "utf8"), /@agentflow-planner/);
    assert.match(await readFile(pack.dispatchInstructionsPath, "utf8"), /workflow:native-collect/);

    const roles = pack.tasks.map((task) => task.role);
    assert.deepEqual(roles, ["Planner", "Debater", "PlannerRevision", "Executor", "Verifier"]);

    for (const task of pack.tasks) {
      assert.ok(task.inputArtifactPath.endsWith("input.json"));
      assert.ok(task.outputArtifactPath.endsWith("output.json"));
      assert.match(await readFile(task.promptPath, "utf8"), new RegExp(`@${task.openCodeAgentName}`));
      assert.match(await readFile(task.promptPath, "utf8"), /Write output JSON to:/);
      assert.match(await readFile(task.inputArtifactPath, "utf8"), /"taskBrief"/);
      assert.match(await readFile(task.promptPath.replace("prompt.md", "output.schema.json"), "utf8"), new RegExp(task.expectedOutputSchema));
    }

    const debater = pack.tasks.find((task) => task.role === "Debater");
    assert.deepEqual(debater?.dependencies, ["planner"]);
  });
});
