import { ConditionEvaluator } from "./ConditionEvaluator.ts";
import type { ConditionEvaluationResult, WorkflowContext, WorkflowGraphConfig } from "./types.ts";

export class WorkflowGraph {
  readonly name: string;
  readonly start: string;
  readonly maxIterations: number;
  readonly nodes: WorkflowGraphConfig["nodes"];
  readonly edges: WorkflowGraphConfig["edges"];
  readonly defaultPolicies: WorkflowGraphConfig["defaultPolicies"];
  readonly inputSchema: WorkflowGraphConfig["inputSchema"];
  private readonly conditionEvaluator = new ConditionEvaluator();

  constructor(config: WorkflowGraphConfig) {
    this.name = config.workflow.name;
    this.start = config.workflow.start;
    this.maxIterations = config.workflow.maxIterations;
    this.nodes = config.nodes;
    this.edges = config.edges;
    this.defaultPolicies = config.defaultPolicies;
    this.inputSchema = config.inputSchema;
  }

  getNode(nodeId: string) {
    const node = this.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      throw new Error(`Unknown workflow node: ${nodeId}`);
    }
    return node;
  }

  getNodeIndex(nodeId: string): number {
    return this.nodes.findIndex((candidate) => candidate.id === nodeId);
  }

  resolveNextNode(currentNodeId: string, context: WorkflowContext): {
    nextNode: string;
    conditionResults: ConditionEvaluationResult[];
  } {
    const outgoing = this.edges.filter((edge) => edge.from === currentNodeId);
    if (outgoing.length === 0) {
      return {
        nextNode: "end",
        conditionResults: [{ edge: `${currentNodeId}->end`, matched: true, reason: "no outgoing edge" }],
      };
    }

    const conditionResults: ConditionEvaluationResult[] = [];
    for (const edge of outgoing) {
      const result = this.conditionEvaluator.evaluate(edge.condition ?? { type: "always" }, context);
      conditionResults.push({
        edge: `${edge.from}->${edge.to}`,
        matched: result.matched,
        reason: result.reason,
      });
      if (result.matched) return { nextNode: edge.to, conditionResults };
    }

    throw new Error(`No edge condition matched from node: ${currentNodeId}. Results: ${JSON.stringify(conditionResults)}`);
  }
}
