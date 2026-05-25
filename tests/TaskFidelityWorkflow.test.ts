import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { ProfileWorkflowRunner } from "../core/profile/ProfileWorkflowRunner.ts";

const execFileAsync = promisify(execFile);

test("Task fidelity workflow", async (t) => {
  await t.test("task-solving coffee workflow produces a real answer deliverable", async () => {
    const result = await new ProfileWorkflowRunner().run({
      profileId: "task-solving",
      task: "解释一下咖啡的做法",
    });

    assert.equal(result.profileId, "task-solving");
    assert.equal(result.taskBrief.userRequest, "解释一下咖啡的做法");
    assert.equal(result.taskBrief.expectedDeliverable.type, "answer");
    assert.ok(result.roleTimeline.some((event) => event.role === "Planner" && /咖啡/.test(event.summary ?? "")));

    const executor = result.roleTimeline.find((event) => event.role === "Executor");
    assert.equal(executor?.source, "subagent_dispatch_trace");
    assert.equal(executor?.subAgentDispatched, true);
    assert.ok(executor?.subAgentId);
    assert.ok(executor?.workerSessionId);
    assert.ok(executor?.inputArtifactPath?.endsWith("input.json"));
    assert.ok(executor?.outputArtifactPath?.endsWith("output.json"));
    assert.equal(executor?.deliverableType, "answer");
    assert.match(executor?.deliverablePreview ?? "", /咖啡/);
    const executorInput = JSON.parse(await readFile(executor.inputArtifactPath!, "utf8"));
    const executorOutput = JSON.parse(await readFile(executor.outputArtifactPath!, "utf8"));
    const executorMetadata = JSON.parse(await readFile(executor.subAgentMetadataPath!, "utf8"));
    assert.ok("revisedPlan" in executorInput);
    assert.match(executorOutput.deliverable.content, /咖啡豆|咖啡粉/);
    assert.equal(executorMetadata.executorType, "mock");
    assert.equal(executorMetadata.isMock, true);
    assert.equal(executorMetadata.isLLMBacked, false);

    const verifier = result.roleTimeline.find((event) => event.role === "Verifier");
    assert.equal(verifier?.source, "subagent_dispatch_trace");
    assert.equal(verifier?.answersUserRequest, true);
    assert.equal(verifier?.isNotMetaOnly, true);
    assert.equal(verifier?.pass, true);
    assert.match(result.formattedText, /AgentFlow 工作流完成/);
    assert.match(result.formattedText, /说明: 本次为 mock subagent simulation，不是 LLM-backed agent/);
    assert.match(result.formattedText, /Executor:/);
    assert.match(result.formattedText, /产物:/);
  });

  await t.test("demo:task-solving-coffee exits successfully", async () => {
    const { stdout } = await execFileAsync("npm", ["run", "demo:task-solving-coffee"], {
      cwd: process.cwd(),
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });

    assert.match(stdout, /AgentFlow 工作流完成/);
    assert.match(stdout, /解释一下咖啡的做法|咖啡/);
    assert.match(stdout, /Executor:/);
    assert.match(stdout, /Verifier:/);
  });
});
