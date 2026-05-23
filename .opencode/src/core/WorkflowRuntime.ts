import { WorkflowContextSchema, type WorkflowContext } from "./schemas.ts";
import type { WorkflowGraph } from "./WorkflowGraph.ts";

export type RuntimeEvent = {
  nodeId: string;
  role: string;
  outputSummary: string;
  nextNode: string | null;
  conditionResult: string | null;
  context: WorkflowContext;
};

export type RuntimeOptions = {
  onStep?: (event: RuntimeEvent) => void;
};

export class WorkflowRuntime {
  private readonly graph: WorkflowGraph;

  constructor(graph: WorkflowGraph) {
    this.graph = graph;
  }

  async run(initialContext: Partial<WorkflowContext>, options: RuntimeOptions = {}): Promise<WorkflowContext> {
    let context = WorkflowContextSchema.parse(initialContext);
    let currentNode = this.graph.startNode;
    let step = 0;

    while (currentNode !== "end") {
      const node = this.graph.getNode(currentNode);
      const startedAt = new Date().toISOString();
      let error: string | undefined;
      let nextNode: string | null = null;
      let conditionResult: string | null = null;

      try {
        context = await node.run(context);
        const resolved = this.graph.resolveNextNode(currentNode, context);
        nextNode = resolved.nextNode;
        conditionResult = resolved.conditionResult;

        if (node.role === "Verifier" && context.verification?.pass === false) {
          context = { ...context, iteration: context.iteration + 1 };
        }

        if (context.iteration > this.graph.maxIterations) {
          nextNode = "end";
          conditionResult = `maxIterations exceeded: ${this.graph.maxIterations}`;
          context = {
            ...context,
            stopReason: `Stopped after exceeding maxIterations=${this.graph.maxIterations}`,
          };
        }
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
        nextNode = "end";
        conditionResult = "node error";
        context = {
          ...context,
          stopReason: `Node ${node.id} failed: ${error}`,
        };
      }

      const outputSummary = summarizeOutput(context[node.outputKey]);
      const traceItem = {
        step,
        nodeId: node.id,
        role: node.role,
        inputKeys: node.inputKeys,
        outputKey: String(node.outputKey),
        outputSummary,
        nextNode,
        conditionResult,
        timestamp: startedAt,
        ...(error ? { error } : {}),
      };

      context = {
        ...context,
        trace: [...context.trace, traceItem],
      };

      options.onStep?.({
        nodeId: node.id,
        role: node.role,
        outputSummary,
        nextNode,
        conditionResult,
        context,
      });

      if (error) {
        break;
      }

      currentNode = nextNode ?? "end";
      step += 1;
    }

    return context;
  }
}

export function summarizeOutput(output: unknown): string {
  if (!output) {
    return "no output";
  }
  if (typeof output === "string") {
    return output.slice(0, 160);
  }
  if (typeof output !== "object") {
    return String(output);
  }

  const record = output as Record<string, unknown>;
  if (typeof record.summary === "string") {
    return record.summary;
  }
  if (typeof record.reason === "string") {
    return `pass=${String(record.pass)} score=${String(record.score)} reason=${record.reason}`;
  }
  if (typeof record.correctionHint === "string") {
    return record.correctionHint;
  }
  return JSON.stringify(record).slice(0, 180);
}
