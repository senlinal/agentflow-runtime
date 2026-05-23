import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TaskBriefLoader } from "../core/TaskBriefLoader.ts";
import { WorkflowRunner } from "../core/WorkflowRunner.ts";
import { WorkflowTemplateRegistry } from "../core/WorkflowTemplateRegistry.ts";

describe("WorkflowRunner", () => {
  it("runs feasible task through Planner and Executor", async () => {
    const { config } = await new WorkflowTemplateRegistry().load("research-feasibility-execute-verify");
    const taskBrief = await TaskBriefLoader.loadJson("inputs/feasible-task.json");
    const result = await new WorkflowRunner().run(config, taskBrief);
    const nodes = result.trace.map((item) => item.nodeId);

    assert.ok(nodes.includes("planner"));
    assert.ok(nodes.includes("executor"));
    assert.ok(result.trace.length > 0);
    assert.ok(result.context.taskBrief);
    assert.ok(result.context.researchReport);
    assert.ok(result.context.feasibilityReport);
  });

  it("stops infeasible task before Planner and Executor", async () => {
    const { config } = await new WorkflowTemplateRegistry().load("research-feasibility-execute-verify");
    const taskBrief = await TaskBriefLoader.loadJson("inputs/infeasible-task.json");
    const result = await new WorkflowRunner().run(config, taskBrief);
    const nodes = result.trace.map((item) => item.nodeId);

    assert.equal(nodes.includes("planner"), false);
    assert.equal(nodes.includes("executor"), false);
    assert.ok(result.trace.length > 0);
    assert.ok(result.context.taskBrief);
    assert.ok(result.context.researchReport);
    assert.ok(result.context.feasibilityReport);
  });

  it("runs abcde-basic with feasible task through Executor", async () => {
    const { config } = await new WorkflowTemplateRegistry().load("abcde-basic");
    const taskBrief = await TaskBriefLoader.loadJson("inputs/feasible-task.json");
    const result = await new WorkflowRunner().run(config, taskBrief);
    const nodes = result.trace.map((item) => item.nodeId);

    assert.ok(nodes.includes("executor"));
    assert.ok(result.trace.length > 0);
    assert.equal(result.context.verification?.pass, true);
  });
});
