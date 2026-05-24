import test from "node:test";
import assert from "node:assert/strict";
import { ProfileTaskInputBuilder } from "../core/profile/ProfileTaskInputBuilder.ts";

test("ProfileTaskInputBuilder", async (t) => {
  const builder = new ProfileTaskInputBuilder();
  const profile = {
    id: "task-solving",
    name: "Task Solving",
    description: "test profile",
    defaultWorkflow: "agent-workforce-task-solving",
    defaultConstraints: ["no real llm"],
    defaultBlockedActions: ["CodeExecutor"],
  };

  await t.test("keeps userRequest and creates answer deliverable for coffee explanation", () => {
    const brief = builder.build({ profile, task: "解释一下咖啡的做法" });

    assert.equal(brief.userRequest, "解释一下咖啡的做法");
    assert.equal(brief.rawUserInput, "解释一下咖啡的做法");
    assert.equal(brief.taskType, "general_answer");
    assert.equal(brief.expectedDeliverable.type, "answer");
    assert.match(brief.expectedDeliverable.description, /coffee|咖啡/i);
    assert.deepEqual(brief.answerRequirements, [
      "materials/tools",
      "step-by-step process",
      "tips or cautions",
      "concise summary",
    ]);
  });

  await t.test("does not use generic profile-aware workflow success criteria", () => {
    const brief = builder.build({ profile, task: "解释一下咖啡的做法" });

    assert.equal(brief.successCriteria.includes("Produce structured profile-aware workflow output."), false);
    assert.ok(brief.successCriteria.includes("Directly answer the user's request."));
    assert.ok(brief.successCriteria.includes("Do not only describe the workflow process."));
  });
});
