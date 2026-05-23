import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MockLLMClient } from "./llm/MockLLMClient.ts";
import { WorkflowGraph } from "./core/WorkflowGraph.ts";
import { WorkflowRuntime } from "./core/WorkflowRuntime.ts";
import type { WorkflowContext } from "./core/schemas.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const defaultWorkflowPath = resolve(here, "../examples/workflow.yaml");
const workflowPath = process.argv[2] ? resolve(process.argv[2]) : defaultWorkflowPath;

const initialContext: Partial<WorkflowContext> = {
  taskId: "task_001",
  userGoal: "帮我设计一个可组合 Agent 工作流系统的 MVP 方案。",
  constraints: {
    runtimeControl: "外层由确定性的 Workflow Runtime 控制流程",
    communication: "Agent 之间通过统一 Context 传递结构化结果",
    llm: "第一版使用 MockLLMClient，后续可替换模型供应商",
    ui: "第一版不要做复杂 UI",
  },
  successCriteria: [
    "AgentNode 抽象包含 id、role、description、systemPrompt、inputKeys、outputKey、outputSchema、run(context) 和 retryPolicy",
    "WorkflowGraph 支持 YAML/JSON 配置、条件跳转、end 和循环",
    "Context 保存结构化中间结果、history 和 trace",
    "Verifier 失败时进入 GoalKeeper 并回到 PlannerRevision",
    "Runtime 设置 maxIterations 防止无限循环",
    "控制台输出节点进度、摘要、验证结果、纠偏提示和完整 trace",
  ],
};

const graph = await WorkflowGraph.fromFile(workflowPath, new MockLLMClient());
const runtime = new WorkflowRuntime(graph);

console.log(`[Runtime] workflow: ${graph.name}`);
console.log(`[Runtime] config: ${workflowPath}`);
console.log(`[Runtime] start: ${graph.startNode}`);
console.log("");

const finalContext = await runtime.run(initialContext, {
  onStep(event) {
    console.log(`[${event.role}] node=${event.nodeId}`);
    console.log(`  output: ${event.outputSummary}`);
    console.log(`  next: ${event.nextNode ?? "end"} (${event.conditionResult ?? "no condition"})`);
    if (event.role === "Verifier" && event.context.verification) {
      console.log(
        `  verification: pass=${event.context.verification.pass} score=${event.context.verification.score}`,
      );
    }
    if (event.role === "GoalKeeper" && event.context.correctionHint) {
      console.log(`  correctionHint: ${event.context.correctionHint.correctionHint}`);
    }
    console.log("");
  },
});

console.log("[Runtime] final result");
console.log(JSON.stringify({
  taskId: finalContext.taskId,
  iteration: finalContext.iteration,
  stopReason: finalContext.stopReason ?? null,
  verification: finalContext.verification,
  finalArtifact: finalContext.executionResult?.artifacts[0] ?? null,
}, null, 2));

console.log("");
console.log("[Runtime] complete trace");
console.log(JSON.stringify(finalContext.trace, null, 2));
