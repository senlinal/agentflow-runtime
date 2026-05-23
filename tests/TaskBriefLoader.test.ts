import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TaskBriefLoader } from "../core/TaskBriefLoader.ts";

describe("TaskBriefLoader", () => {
  it("loads a valid TaskBrief from JSON", async () => {
    const brief = await TaskBriefLoader.loadJson("inputs/feasible-task.json");
    assert.equal(brief.taskId, "task_runner_feasible_001");
    assert.ok(brief.goal.includes("workflow template runner"));
  });

  it("fails when goal is missing", () => {
    assert.throws(() => TaskBriefLoader.fromObject({ ...validBrief(), goal: undefined }), /TaskBrief\.goal/);
  });

  it("fails when currentState is missing", () => {
    assert.throws(
      () => TaskBriefLoader.fromObject({ ...validBrief(), currentState: undefined }),
      /TaskBrief\.currentState/,
    );
  });

  it("generates taskId when missing", () => {
    const { taskId: _taskId, ...raw } = validBrief();
    const brief = TaskBriefLoader.fromObject(raw, "missing-id.json");
    assert.ok(brief.taskId.startsWith("task_"));
  });
});

function validBrief() {
  return {
    taskId: "task_test",
    goal: "goal",
    currentState: "state",
    constraints: [],
    resources: [],
    budget: "low",
    successCriteria: [],
    nonGoals: [],
  };
}
