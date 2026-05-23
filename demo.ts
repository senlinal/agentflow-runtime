import { resolve } from "node:path";
import { createInitialContext } from "./core/context.ts";
import { NodeRegistry } from "./core/NodeRegistry.ts";
import { TraceStore } from "./core/TraceStore.ts";
import { WorkflowLoader } from "./core/WorkflowLoader.ts";
import { WorkflowRuntime } from "./core/WorkflowRuntime.ts";

const workflowPath = resolve("examples/demo-workflow.json");
const graph = await WorkflowLoader.loadJson(workflowPath);
const runtime = new WorkflowRuntime(graph, NodeRegistry.withDefaults());

const context = createInitialContext({
  taskId: "task_001",
  userGoal: "实现一个可组合式 Agent 工作流编排框架 MVP。",
  constraints: {
    llm: "mock only",
    ui: "none",
    shell: "do not bind to opencode in phase one",
  },
  successCriteria: [
    "AgentNode, WorkflowContext, WorkflowGraph, WorkflowRuntime, WorkflowTrace, NodeExecutor are defined.",
    "Demo workflow supports Planner -> Debater -> PlannerRevision -> Executor -> Verifier.",
    "Verifier failure routes to GoalKeeper and loops back to PlannerRevision.",
    "maxIterations prevents infinite loops.",
    "Runtime outputs complete trace.",
  ],
});

console.log(`[Runtime] workflow=${graph.name}`);
console.log(`[Runtime] start=${graph.start}`);
console.log(`[Runtime] maxIterations=${graph.maxIterations}`);
console.log("");

const finalContext = await runtime.run(context);
const traceStoreResult = await TraceStore.save(finalContext, { workflowName: graph.name });

console.log("");
console.log("[Runtime] final verification");
console.log(JSON.stringify(finalContext.verification, null, 2));

console.log("");
console.log("[Runtime] full trace");
console.log(JSON.stringify(finalContext.trace, null, 2));

console.log("");
console.log("[Runtime] trace files");
console.log(JSON.stringify(traceStoreResult, null, 2));
