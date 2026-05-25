import { createInitialContext } from "./context.ts";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { agentFlowPath } from "./AgentFlowPaths.ts";
import { LLMConfigLoader } from "./LLMConfigLoader.ts";
import { LLMConfigReporter } from "./LLMConfigReporter.ts";
import { NodeRegistry } from "./NodeRegistry.ts";
import { SubAgentArtifactStore } from "./subagent/SubAgentArtifactStore.ts";
import { SubAgentDispatcher } from "./subagent/SubAgentDispatcher.ts";
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

export type WorkflowRunnerOptions = {
  contextOverrides?: Partial<WorkflowContext>;
  baseRunDir?: string;
};

export class WorkflowRunner {
  private readonly registry: NodeRegistry;

  constructor(registry = NodeRegistry.withDefaults()) {
    this.registry = registry;
  }

  async run(config: WorkflowGraphConfig, taskBrief: TaskBrief, options: WorkflowRunnerOptions = {}): Promise<WorkflowRunnerResult> {
    const graph = new WorkflowGraph(config);
    const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
    const runDir = join(options.baseRunDir ?? agentFlowPath(".workflow-runs"), runId);
    await mkdir(runDir, { recursive: true });
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
      runtimeMetadata: {
        ...buildRuntimeMetadata(config),
        adaptiveExecution: {
          runId,
          runDir,
          attemptsDir: join(runDir, "attempts"),
        },
      },
      ...options.contextOverrides,
    };

    const subAgentDispatcher = new SubAgentDispatcher(new SubAgentArtifactStore(runDir));
    const finalContext = await new WorkflowRuntime(graph, this.registry, subAgentDispatcher).run(context);
    const traceStore = await TraceStore.save(finalContext, {
      workflowName: graph.name,
      templateVersion: config.workflow.version,
      runId,
      runDir,
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
