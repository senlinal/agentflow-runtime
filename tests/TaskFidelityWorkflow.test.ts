import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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
    assert.equal(executor?.deliverableType, "answer");
    assert.match(executor?.deliverablePreview ?? "", /咖啡/);

    const verifier = result.roleTimeline.find((event) => event.role === "Verifier");
    assert.equal(verifier?.answersUserRequest, true);
    assert.equal(verifier?.isNotMetaOnly, true);
    assert.equal(verifier?.pass, true);
    assert.match(result.formattedText, /Role Timeline/);
    assert.match(result.formattedText, /Runtime Proof/);
    assert.match(result.formattedText, /deliverable: answer/);
  });

  await t.test("demo:task-solving-coffee exits successfully", async () => {
    const { stdout } = await execFileAsync("npm", ["run", "demo:task-solving-coffee"], {
      cwd: process.cwd(),
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });

    assert.match(stdout, /userRequest|Task: 解释一下咖啡的做法|解释一下咖啡的做法/);
    assert.match(stdout, /deliverable: answer/);
    assert.match(stdout, /answersUserRequest: true/);
    assert.match(stdout, /isNotMetaOnly: true/);
    assert.match(stdout, /Runtime Proof/);
  });
});
