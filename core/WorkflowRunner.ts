import { createInitialContext } from "./context.ts";
import { LLMConfigLoader } from "./LLMConfigLoader.ts";
import { LLMConfigReporter } from "./LLMConfigReporter.ts";
import { NodeRegistry } from "./NodeRegistry.ts";
import { TraceStore, type TraceStoreResult } from "./TraceStore.ts";
import type { TaskBrief, WorkflowContext, WorkflowGraphConfig, WorkflowTrace } from "./types.ts";
import { WorkflowGraph } from "./WorkflowGraph.ts";
import { WorkflowRuntime } from "./WorkflowRuntime.ts";

export type WorkflowRunnerResult = {
  context: WorkflowContext;
  trace: WorkflowTrace[];
  runId: string;
  tracePath: string;
  contextPath: string;
  summaryPath: string;
  traceStore: TraceStoreResult;
};

export class WorkflowRunner {
  private readonly registry: NodeRegistry;

  constructor(registry = NodeRegistry.withDefaults()) {
    this.registry = registry;
  }

  async run(config: WorkflowGraphConfig, taskBrief: TaskBrief): Promise<WorkflowRunnerResult> {
    const graph = new WorkflowGraph(config);
    const context = {
      ...createInitialContext({
        taskId: taskBrief.taskId,
        userGoal: taskBrief.goal,
        constraints: {
          taskBriefConstraints: taskBrief.constraints,
          resources: taskBrief.resources,
          budget: taskBrief.budget,
          nonGoals: taskBrief.nonGoals,
        },
        successCriteria: taskBrief.successCriteria,
      }),
      taskBrief,
      runtimeMetadata: buildRuntimeMetadata(config),
    };

    const finalContext = await new WorkflowRuntime(graph, this.registry).run(context);
    const traceStore = await TraceStore.save(finalContext, {
      workflowName: graph.name,
      templateVersion: config.workflow.version,
    });

    return {
      context: finalContext,
      trace: finalContext.trace,
      runId: traceStore.runId,
      tracePath: traceStore.tracePath,
      contextPath: traceStore.contextPath,
      summaryPath: traceStore.summaryPath,
      traceStore,
    };
  }
}

function buildRuntimeMetadata(config: WorkflowGraphConfig): WorkflowContext["runtimeMetadata"] | undefined {
  const usesLlmNode = config.nodes.some((node) => node.type === "llm");
  if (!usesLlmNode) return undefined;
  const llmConfig = LLMConfigLoader.fromEnv(process.env, { validateCredentials: false });
  return {
    llmConfigSummary: LLMConfigReporter.summarize(llmConfig) as unknown as Record<string, unknown>,
  };
}
