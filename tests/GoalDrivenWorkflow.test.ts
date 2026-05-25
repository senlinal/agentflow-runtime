import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { NodeRegistry } from "../core/NodeRegistry.ts";
import { WorkflowTemplateRegistry } from "../core/WorkflowTemplateRegistry.ts";
import { WorkflowRunner } from "../core/WorkflowRunner.ts";
import type { AgentNode, ExecutionResult, NodeExecutor, TaskBrief, WorkflowContext } from "../core/types.ts";

describe("goal-driven task-solving workflow", () => {
  it("ends after one successful attempt and writes attempt records", async () => {
    const result = await runGoalWorkflow(coffeeBrief(), NodeRegistry.withDefaults());

    assert.equal(result.context.attemptDecision?.decision, "success");
    assert.equal(result.trace.filter((item) => item.nodeId === "attemptExecutor").length, 1);
    assert.equal(result.trace.some((item) => item.nodeId === "codeExecutor" || item.role === "CodeExecutor"), false);
    assert.ok(result.trace.some((item) => item.attemptNumber === 1 && item.routeId === "direct_deliverable"));
    const attempts = await readdir(join(result.traceStore.runDir, "attempts"));
    assert.ok(attempts.includes("attempt-001.json"));
    assert.ok(attempts.includes("decisions.jsonl"));
  });

  it("retries after a meta-only attempt and succeeds on the second attempt", async () => {
    const registry = NodeRegistry.withDefaults();
    registry.register("attempt", new FlakyAttemptExecutor());

    const result = await runGoalWorkflow(coffeeBrief(), registry);

    assert.equal(result.context.attemptDecision?.decision, "success");
    assert.equal(result.trace.filter((item) => item.nodeId === "attemptExecutor").length, 2);
    assert.ok(result.trace.some((item) => item.attemptDecision === "retry"));
    assert.ok(result.trace.some((item) => item.attemptNumber === 2 && item.routeId === "add_missing_content"));
    const decisionText = await readFile(join(result.traceStore.runDir, "attempts", "decisions.jsonl"), "utf8");
    assert.match(decisionText, /"decision":"retry"/);
    assert.match(decisionText, /"decision":"success"/);
  });
});

async function runGoalWorkflow(taskBrief: TaskBrief, registry: NodeRegistry) {
  const { config } = await new WorkflowTemplateRegistry().load("goal-driven-task-solving");
  const baseRunDir = await mkdtemp(join(tmpdir(), "agentflow-goal-workflow-"));
  return new WorkflowRunner(registry).run(config, taskBrief, { baseRunDir });
}

function coffeeBrief(): TaskBrief {
  return {
    taskId: "coffee",
    goal: "解释一下咖啡的做法",
    userRequest: "解释一下咖啡的做法",
    taskType: "general_answer",
    expectedDeliverable: { type: "answer", description: "A clear explanation of how to make coffee." },
    answerRequirements: ["materials/tools", "step-by-step process", "tips or cautions", "concise summary"],
    currentState: "test",
    constraints: [],
    resources: [],
    budget: "local",
    successCriteria: ["Directly answer the user's request.", "Do not only describe the workflow process."],
    nonGoals: [],
    rawUserInput: "解释一下咖啡的做法",
  };
}

class FlakyAttemptExecutor implements NodeExecutor {
  async execute(_node: AgentNode, context: WorkflowContext): Promise<ExecutionResult> {
    const attemptNumber = (context.adaptiveState?.attempts.length ?? 0) + 1;
    const routeId = attemptNumber === 1 ? "direct_deliverable" : "add_missing_content";
    context.adaptiveState = {
      goalPlan: context.goalExecutionPlan ?? context.adaptiveState?.goalPlan,
      attempts: context.adaptiveState?.attempts ?? [],
      decisions: context.adaptiveState?.decisions ?? [],
      currentAttemptNumber: attemptNumber,
      currentRouteId: routeId,
      status: attemptNumber === 1 ? "attempting" : "retrying",
    };
    const content = attemptNumber === 1
      ? "我已经执行了咖啡说明 workflow。"
      : "做咖啡需要咖啡粉、热水、滤杯和杯子。先烧水到 90-96 摄氏度，研磨咖啡豆，润湿滤纸，倒入咖啡粉，先闷蒸 30 秒，再分次绕圈注水萃取。注意控制粉水比、水温、研磨粗细和时间。简要总结：准备咖啡粉和热水，按比例萃取即可。";
    return {
      status: "success",
      deliverable: { type: "answer", content },
      evidenceOfCompletion: [`attemptNumber=${attemptNumber}`, `routeId=${routeId}`],
      limitations: [],
      completedSteps: [routeId],
      artifacts: [`attempt:${attemptNumber}`],
      summary: `Attempt ${attemptNumber}`,
      errors: [],
      rawOutput: JSON.stringify({ attemptNumber, routeId }),
    };
  }
}
