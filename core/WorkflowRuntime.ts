import { NodeRegistry } from "./NodeRegistry.ts";
import { SchemaValidator } from "./SchemaValidator.ts";
import type { ConditionEvaluationResult, SubAgentDispatchMetadata, WorkflowContext, WorkflowTrace } from "./types.ts";
import type { SubAgentArtifactRecord } from "./subagent/SubAgentArtifactStore.ts";
import type { SubAgentDispatchHandle, SubAgentDispatcher } from "./subagent/SubAgentDispatcher.ts";
import { WorkflowGraph } from "./WorkflowGraph.ts";

export class WorkflowRuntime {
  private readonly graph: WorkflowGraph;
  private readonly registry: NodeRegistry;
  private readonly subAgentDispatcher?: SubAgentDispatcher;

  constructor(graph: WorkflowGraph, registry: NodeRegistry, subAgentDispatcher?: SubAgentDispatcher) {
    this.graph = graph;
    this.registry = registry;
    this.subAgentDispatcher = subAgentDispatcher;
  }

  async run(context: WorkflowContext): Promise<WorkflowContext> {
    let currentNodeId = this.graph.start;
    let step = 0;

    while (currentNodeId !== "end") {
      const node = this.graph.getNode(currentNodeId);
      const timestamp = new Date().toISOString();
      let dispatchHandle: SubAgentDispatchHandle | undefined;
      let dispatchRecord: SubAgentArtifactRecord | undefined;

      try {
        const executor = this.registry.getExecutor(node);
        dispatchHandle = await this.subAgentDispatcher?.start(node, context, step);
        const output = SchemaValidator.validate(node.outputSchema, await executor.execute(node, context));
        dispatchRecord = dispatchHandle
          ? await this.subAgentDispatcher?.complete(dispatchHandle, output, context)
          : undefined;
        context = {
          ...context,
          [node.outputKey]: output,
          subAgentDispatches: appendDispatch(context.subAgentDispatches, dispatchRecord),
          history: [
            ...context.history,
            { nodeId: node.id, role: node.role, outputKey: node.outputKey, output, timestamp, subAgentId: dispatchRecord?.subAgentId },
          ],
        };

        let resolved = this.graph.resolveNextNode(node.id, context);
        if (this.isBackEdge(node.id, resolved.nextNode)) {
          context = { ...context, iteration: context.iteration + 1 };
        }

        if (context.iteration >= this.graph.maxIterations && resolved.nextNode !== "end") {
          resolved = {
            nextNode: "end",
            conditionResults: [{
              edge: `${node.id}->end`,
              matched: true,
              reason: `maxIterations reached: ${this.graph.maxIterations}`,
            }],
          };
          context = {
            ...context,
            stopReason: `Stopped because maxIterations=${this.graph.maxIterations} was reached.`,
          };
        }

        const trace = createTrace({
          step,
          node,
          context,
          nextNode: resolved.nextNode,
          conditionResults: resolved.conditionResults,
          timestamp,
          dispatchRecord,
        });
        context = { ...context, trace: [...context.trace, trace] };

        printStep(trace);
        currentNodeId = resolved.nextNode;
        step += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (dispatchHandle) {
          dispatchRecord = await this.subAgentDispatcher?.fail(dispatchHandle, message, context);
        }
        const trace = createTrace({
          step,
          node,
          context,
          nextNode: "end",
          conditionResults: [{ edge: `${node.id}->end`, matched: true, reason: "error" }],
          timestamp,
          error: message,
          dispatchRecord,
        });
        context = {
          ...context,
          stopReason: `Node ${node.id} failed: ${message}`,
          subAgentDispatches: appendDispatch(context.subAgentDispatches, dispatchRecord),
          trace: [...context.trace, trace],
        };
        printStep(trace);
        break;
      }
    }

    return context;
  }

  private isBackEdge(from: string, to: string): boolean {
    if (to === "end") return false;
    const fromIndex = this.graph.getNodeIndex(from);
    const toIndex = this.graph.getNodeIndex(to);
    return fromIndex >= 0 && toIndex >= 0 && toIndex <= fromIndex;
  }
}

function createTrace(input: {
  step: number;
  node: ReturnType<WorkflowGraph["getNode"]>;
  context: WorkflowContext;
  nextNode: string;
  conditionResults: ConditionEvaluationResult[];
  timestamp: string;
  error?: string;
  dispatchRecord?: SubAgentArtifactRecord;
}): WorkflowTrace {
  return {
    step: input.step,
    nodeId: input.node.id,
    role: input.node.role,
    nodeType: input.node.type,
    inputKeys: input.node.inputKeys,
    outputKey: input.node.outputKey,
    outputSchema: input.node.outputSchema,
    outputSummary: summarize(input.context[input.node.outputKey]),
    ...summarizeDispatch(input.dispatchRecord),
    ...summarizeAdaptive(input.context),
    ...summarizeDeliverable(input.context[input.node.outputKey]),
    ...summarizeVerification(input.context[input.node.outputKey]),
    conditionResults: input.conditionResults,
    nextNode: input.nextNode,
    timestamp: input.timestamp,
    ...(input.error ? { error: input.error } : {}),
  };
}

function summarizeAdaptive(context: WorkflowContext): Partial<WorkflowTrace> {
  const decision = context.attemptDecision;
  const attemptNumber = context.adaptiveState?.currentAttemptNumber;
  const routeId = context.adaptiveState?.currentRouteId;
  return {
    ...(attemptNumber ? { attemptNumber } : {}),
    ...(routeId ? { routeId } : {}),
    ...(decision?.decision ? { attemptDecision: decision.decision } : {}),
    ...(decision?.decision === "retry" ? { retryReason: decision.reason } : {}),
    ...(decision?.decision === "stop" || decision?.decision === "ask_human" ? { stopReason: decision.reason } : {}),
  };
}

function appendDispatch(
  existing: SubAgentDispatchMetadata[] | undefined,
  dispatchRecord: SubAgentArtifactRecord | undefined,
): SubAgentDispatchMetadata[] | undefined {
  if (!dispatchRecord) return existing;
  return [...(existing ?? []), dispatchRecord];
}

function summarize(value: unknown): string {
  if (!value) return "no output";
  if (typeof value !== "object") return String(value);
  const record = value as Record<string, unknown>;
  if (typeof record.summary === "string") return record.summary;
  if (typeof record.reason === "string") return record.reason;
  if (Array.isArray(record.correctionInstructions)) return record.correctionInstructions.join(" ");
  return JSON.stringify(record).slice(0, 160);
}

function summarizeDispatch(record: SubAgentArtifactRecord | undefined): Partial<WorkflowTrace> {
  if (!record) return { subAgentDispatched: false };
  return {
    subAgentDispatched: true,
    subAgentId: record.subAgentId,
    workerSessionId: record.workerSessionId,
    executorType: record.executorType,
    isMock: record.isMock,
    isLLMBacked: record.isLLMBacked,
    ...(record.modelProvider ? { modelProvider: record.modelProvider } : {}),
    ...(record.modelName ? { modelName: record.modelName } : {}),
    ...(record.callStatus ? { callStatus: record.callStatus } : {}),
    inputArtifactPath: record.inputArtifactPath,
    outputArtifactPath: record.outputArtifactPath,
    subAgentMetadataPath: record.metadataPath,
    subAgentTraceSource: "subagent_dispatch_trace",
  };
}

function summarizeDeliverable(value: unknown): { deliverableType?: string; deliverablePreview?: string } {
  if (!value || typeof value !== "object") return {};
  const deliverable = (value as Record<string, unknown>).deliverable;
  if (!deliverable || typeof deliverable !== "object") return {};
  const record = deliverable as Record<string, unknown>;
  if (typeof record.type !== "string" || typeof record.content !== "string") return {};
  return {
    deliverableType: record.type,
    deliverablePreview: record.content.replace(/\s+/g, " ").slice(0, 120),
  };
}

function summarizeVerification(value: unknown): { answersUserRequest?: boolean; isNotMetaOnly?: boolean; pass?: boolean } {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    ...(typeof record.answersUserRequest === "boolean" ? { answersUserRequest: record.answersUserRequest } : {}),
    ...(typeof record.isNotMetaOnly === "boolean" ? { isNotMetaOnly: record.isNotMetaOnly } : {}),
    ...(typeof record.pass === "boolean" ? { pass: record.pass } : {}),
  };
}

function printStep(trace: WorkflowTrace): void {
  console.log(`[${trace.role}] ${trace.nodeId}`);
  console.log(`  output: ${trace.outputSummary}`);
  console.log(`  next: ${trace.nextNode} (${trace.conditionResults.map((item) => item.reason).join("; ")})`);
}
