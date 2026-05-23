import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { z } from "zod";
import type { LLMClient } from "../llm/LLMClient.ts";
import { AgentNode, readPath } from "./AgentNode.ts";
import type { WorkflowContext } from "./schemas.ts";

const ConditionSchema = z.object({
  path: z.string(),
  operator: z.enum(["equals", "notEquals", "truthy", "falsy"]),
  value: z.unknown().optional(),
});

const EdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  condition: ConditionSchema.optional(),
  label: z.string().optional(),
});

const NodeSchema = z.object({
  id: z.string(),
  role: z.string(),
  description: z.string(),
  systemPrompt: z.string(),
  inputKeys: z.array(z.string()),
  outputKey: z.string(),
  outputSchema: z.string(),
  retryPolicy: z.object({
    maxAttempts: z.number().int().positive(),
    backoffMs: z.number().int().nonnegative().optional(),
  }).optional(),
});

export const WorkflowConfigSchema = z.object({
  name: z.string(),
  startNode: z.string(),
  maxIterations: z.number().int().positive(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;
export type WorkflowEdge = z.infer<typeof EdgeSchema>;

export type ResolvedNextNode = {
  nextNode: string;
  conditionResult: string;
};

export class WorkflowGraph {
  readonly name: string;
  readonly startNode: string;
  readonly maxIterations: number;
  readonly nodes: Map<string, AgentNode>;
  readonly edges: WorkflowEdge[];

  constructor(config: WorkflowConfig, llm: LLMClient) {
    this.name = config.name;
    this.startNode = config.startNode;
    this.maxIterations = config.maxIterations;
    this.nodes = new Map(config.nodes.map((node) => [node.id, new AgentNode(node as any, llm)]));
    this.edges = config.edges;

    if (!this.nodes.has(this.startNode)) {
      throw new Error(`Workflow startNode does not exist: ${this.startNode}`);
    }
  }

  static async fromFile(path: string, llm: LLMClient): Promise<WorkflowGraph> {
    const text = await readFile(path, "utf8");
    const raw = path.endsWith(".json") ? JSON.parse(text) : YAML.parse(text);
    const config = WorkflowConfigSchema.parse(raw);
    return new WorkflowGraph(config, llm);
  }

  getNode(nodeId: string): AgentNode {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Unknown workflow node: ${nodeId}`);
    }
    return node;
  }

  resolveNextNode(currentNodeId: string, context: WorkflowContext): ResolvedNextNode {
    const candidates = this.edges.filter((edge) => edge.from === currentNodeId);
    if (candidates.length === 0) {
      return { nextNode: "end", conditionResult: "no outgoing edge" };
    }

    for (const edge of candidates) {
      const condition = edge.condition;
      if (!condition) {
        return { nextNode: edge.to, conditionResult: edge.label ?? "default" };
      }

      const actual = readPath(context, condition.path);
      const matched = evaluateCondition(condition.operator, actual, condition.value);
      if (matched) {
        const expected = condition.operator === "truthy" || condition.operator === "falsy"
          ? condition.operator
          : `${condition.operator} ${JSON.stringify(condition.value)}`;
        return {
          nextNode: edge.to,
          conditionResult: `${condition.path} ${expected}`,
        };
      }
    }

    throw new Error(`No edge condition matched from node: ${currentNodeId}`);
  }
}

function evaluateCondition(operator: string, actual: unknown, expected: unknown): boolean {
  switch (operator) {
    case "equals":
      return actual === expected;
    case "notEquals":
      return actual !== expected;
    case "truthy":
      return Boolean(actual);
    case "falsy":
      return !actual;
    default:
      return false;
  }
}
