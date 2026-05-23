import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { negotiateTask } from "../core/negotiation/TaskNegotiatorExecutor.ts";
import { TaskBriefLoader } from "../core/TaskBriefLoader.ts";
import { WorkflowRunner } from "../core/WorkflowRunner.ts";
import { WorkflowTemplateRegistry } from "../core/WorkflowTemplateRegistry.ts";

describe("TaskNegotiator", () => {
  it("classifies ambiguous RAG work and asks for human scope confirmation", async () => {
    const taskBrief = await TaskBriefLoader.loadJson("inputs/task-negotiation-rag-task.json");
    const result = negotiateTask(taskBrief);

    assert.equal(result.detectedTaskType, "rag_optimization");
    assert.equal(result.recommendedNextStep, "ask_human");
    assert.equal(result.readyToExecute, false);
    assert.ok(result.clarificationQuestions.length > 0);
    assert.ok(result.proposedScope.blockedActions.includes("execute_code"));
    assert.ok(result.proposedScope.blockedActions.includes("modify_files"));
    assert.ok(result.proposedScope.blockedActions.includes("delete_files"));
  });

  it("allows specific scoped tasks to proceed only to feasibility", () => {
    const result = negotiateTask({
      taskId: "task_specific_fix",
      goal: "Fix failing calculator add test.",
      currentState: "src/calculator.ts add currently subtracts, and npm test fails on calculator.test.js.",
      constraints: ["only modify src/calculator.ts", "do not modify src/string-utils.ts"],
      resources: ["npm test"],
      budget: "low",
      successCriteria: ["npm test passes", "only src/calculator.ts changes"],
      nonGoals: ["do not delete files"],
    });

    assert.equal(result.detectedTaskType, "coding_fix");
    assert.equal(result.recommendedNextStep, "proceed_to_feasibility");
    assert.equal(result.readyToExecute, true);
    assert.deepEqual(result.proposedScope.allowedFiles, ["src/calculator.ts"]);
    assert.ok(result.proposedScope.forbiddenFiles?.includes("src/string-utils.ts"));
  });

  it("splits high complexity broad tasks before feasibility", () => {
    const result = negotiateTask({
      taskId: "task_platform",
      goal: "Build a complete Dify replacement platform with UI, plugin marketplace, auth, permissions, and deployment.",
      currentState: "Current project is a CLI runtime.",
      constraints: ["do not use real LLM"],
      resources: [],
      budget: "low",
      successCriteria: ["platform works"],
      nonGoals: [],
    });

    assert.equal(result.complexity, "high");
    assert.equal(result.recommendedNextStep, "split_task");
    assert.equal(result.readyToExecute, false);
  });

  it("runs task-negotiation workflow without calling CodeExecutor", async () => {
    const { config } = await new WorkflowTemplateRegistry().load("task-negotiation");
    const taskBrief = await TaskBriefLoader.loadJson("inputs/task-negotiation-rag-task.json");
    const result = await new WorkflowRunner().run(config, taskBrief);
    const nodes = result.trace.map((item) => item.nodeId);

    assert.deepEqual(nodes, ["taskNegotiator"]);
    assert.ok(result.context.taskNegotiationResult);
    assert.equal(result.context.taskNegotiationResult?.readyToExecute, false);
    assert.equal(nodes.includes("codeExecutor"), false);
    assert.match(await readFile(result.summaryPath, "utf8"), /TaskNegotiationResult/);
  });
});
