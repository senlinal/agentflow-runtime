import { resolve } from "node:path";
import { createInitialContext } from "./core/context.ts";
import { NodeRegistry } from "./core/NodeRegistry.ts";
import { SchemaValidator } from "./core/SchemaValidator.ts";
import { TraceStore } from "./core/TraceStore.ts";
import type { TaskBrief } from "./core/types.ts";
import { WorkflowLoader } from "./core/WorkflowLoader.ts";
import { WorkflowRuntime } from "./core/WorkflowRuntime.ts";

const scenario = process.argv[2] ?? "feasible";
const workflowPath = resolve("examples/research-feasibility-workflow.json");
const graph = await WorkflowLoader.loadJson(workflowPath);
const taskBrief = buildTaskBrief(scenario);
SchemaValidator.validate("TaskBrief", taskBrief);

const context = {
  ...createInitialContext({
    taskId: taskBrief.taskId,
    userGoal: taskBrief.goal,
    constraints: { source: "TaskBrief" },
    successCriteria: taskBrief.successCriteria,
  }),
  taskBrief,
};

const runtime = new WorkflowRuntime(graph, NodeRegistry.withDefaults());

console.log(`[Runtime] workflow=${graph.name}`);
console.log(`[Runtime] scenario=${scenario}`);
console.log(`[Runtime] start=${graph.start}`);
console.log(`[Runtime] maxIterations=${graph.maxIterations}`);
console.log("");

const finalContext = await runtime.run(context);
const traceStoreResult = await TraceStore.save(finalContext, { workflowName: graph.name });

console.log("");
console.log("[Runtime] feasibility");
console.log(JSON.stringify(finalContext.feasibilityReport, null, 2));
console.log("");
console.log("[Runtime] final verification");
console.log(JSON.stringify(finalContext.verification, null, 2));
console.log("");
console.log("[Runtime] trace files");
console.log(JSON.stringify(traceStoreResult, null, 2));

function buildTaskBrief(kind: string): TaskBrief {
  if (kind === "infeasible") {
    return {
      taskId: "task_infeasible_001",
      goal: "三天内完成一个完整 Dify 替代品，包括复杂 UI、多人协作、插件市场、权限系统、真实 LLM 接入和部署平台。",
      currentState: "当前只有 CLI Runtime、MockLLMClient、配置驱动 workflow，没有 UI、没有真实 LLM、没有 opencode adapter。",
      constraints: ["不接真实 LLM", "不接 opencode", "不做 UI", "三天时间限制"],
      resources: ["CLI Runtime", "MockLLMClient", "配置驱动 workflow"],
      budget: "low",
      successCriteria: ["给出可行性判断", "不盲目进入执行", "输出替代方案"],
      nonGoals: ["完整产品替代", "生产部署", "真实模型接入"],
      rawUserInput: kind,
    };
  }

  return {
    taskId: "task_feasible_001",
    goal: "基于当前已完成的配置驱动 Runtime，增加可复用 workflow template 和 feasibility gate。",
    currentState:
      "项目已经有 WorkflowLoader、ConditionEvaluator、NodeRegistry、TraceStore、SchemaValidator、MockLLMClient，并且 npm run test 通过。",
    constraints: ["不接真实 LLM", "不接 opencode", "不做 UI", "保持 demo 和 test 通过"],
    resources: ["TypeScript core runtime", "MockLLMClient", "node:test", "workflow JSON config"],
    budget: "medium",
    successCriteria: ["Researcher 运行", "FeasibilityEvaluator 运行", "可行时进入 Planner/Executor/Verifier", "trace 落盘"],
    nonGoals: ["真实搜索", "真实 LLM", "UI builder"],
    rawUserInput: kind,
  };
}
