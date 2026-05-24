import { NodeRegistry } from "./NodeRegistry.ts";
import { SchemaValidator } from "./SchemaValidator.ts";
import type { ConditionEvaluationResult, WorkflowContext, WorkflowTrace } from "./types.ts";
import { WorkflowGraph } from "./WorkflowGraph.ts";

export class WorkflowRuntime {
  private readonly graph: WorkflowGraph;
  private readonly registry: NodeRegistry;

  constructor(graph: WorkflowGraph, registry: NodeRegistry) {
    this.graph = graph;
    this.registry = registry;
  }

  async run(context: WorkflowContext): Promise<WorkflowContext> {
    let currentNodeId = this.graph.start;
    let step = 0;

    while (currentNodeId !== "end") {
      const node = this.graph.getNode(currentNodeId);
      const timestamp = new Date().toISOString();

      try {
        const executor = this.registry.getExecutor(node);
        const output = SchemaValidator.validate(node.outputSchema, await executor.execute(node, context));
        context = {
          ...context,
          [node.outputKey]: output,
          history: [
            ...context.history,
            { nodeId: node.id, role: node.role, outputKey: node.outputKey, output, timestamp },
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
        });
        context = { ...context, trace: [...context.trace, trace] };

        printStep(trace);
        currentNodeId = resolved.nextNode;
        step += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const trace = createTrace({
          step,
          node,
          context,
          nextNode: "end",
          conditionResults: [{ edge: `${node.id}->end`, matched: true, reason: "error" }],
          timestamp,
          error: message,
        });
        context = {
          ...context,
          stopReason: `Node ${node.id} failed: ${message}`,
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
        ...summarizeDeliverable(input.context[input.node.outputKey]),
        ...summarizeVerification(input.context[input.node.outputKey]),
        conditionResults: input.conditionResults,
    nextNode: input.nextNode,
    timestamp: input.timestamp,
    ...(input.error ? { error: input.error } : {}),
  };
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
