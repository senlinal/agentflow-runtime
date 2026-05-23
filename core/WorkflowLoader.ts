import { readFile } from "node:fs/promises";
import { isSupportedOutputSchema } from "./OutputSchemaRegistry.ts";
import type { AgentNode, WorkflowGraphConfig } from "./types.ts";
import { WorkflowGraph } from "./WorkflowGraph.ts";

const NODE_TYPES = ["mock", "llm", "negotiate", "scopeGate", "code", "test", "verify", "repair", "approval", "materialize", "executionApproval", "executionDryRun", "execution"];

export class WorkflowLoader {
  static async loadJson(path: string): Promise<WorkflowGraph> {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const config = normalizeAndValidate(parsed);
    return new WorkflowGraph(config);
  }
}

function normalizeAndValidate(raw: unknown): WorkflowGraphConfig {
  if (!raw || typeof raw !== "object") {
    throw new Error("Workflow file must contain a JSON object.");
  }
  const record = raw as Record<string, unknown>;
  const workflow = getWorkflowRecord(record);

  const name = workflow.name;
  const start = workflow.start;
  const maxIterations = workflow.maxIterations;
  if (typeof name !== "string" || !name) throw new Error("workflow.name is required.");
  if (typeof start !== "string" || !start) throw new Error("workflow.start is required.");
  if (!Number.isInteger(maxIterations) || Number(maxIterations) < 1) {
    throw new Error("workflow.maxIterations must be an integer >= 1.");
  }

  if (!Array.isArray(record.nodes) || record.nodes.length === 0) {
    throw new Error("Workflow config requires non-empty nodes array.");
  }
  if (!Array.isArray(record.edges)) {
    throw new Error("Workflow config requires edges array.");
  }

  const nodes = record.nodes.map(validateNode);
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!nodeIds.has(start)) {
    throw new Error(`workflow.start node does not exist: ${start}`);
  }

  const edges = record.edges.map((edge, index) => {
    if (!edge || typeof edge !== "object") throw new Error(`edges[${index}] must be an object.`);
    const item = edge as Record<string, unknown>;
    if (typeof item.from !== "string" || !item.from) throw new Error(`edges[${index}].from is required.`);
    if (typeof item.to !== "string" || !item.to) throw new Error(`edges[${index}].to is required.`);
    if (!nodeIds.has(item.from)) throw new Error(`edges[${index}].from does not exist: ${item.from}`);
    if (item.to !== "end" && !nodeIds.has(item.to)) throw new Error(`edges[${index}].to does not exist: ${item.to}`);

    const condition = item.condition;
    if (condition !== undefined) {
      validateCondition(condition, index);
    }
    return item as WorkflowGraphConfig["edges"][number];
  });

  return {
    workflow: {
      name,
      version: typeof workflow.version === "string" ? workflow.version : undefined,
      description: typeof workflow.description === "string" ? workflow.description : undefined,
      start,
      maxIterations: Number(maxIterations),
    },
    nodes,
    edges,
    inputSchema: typeof record.inputSchema === "string" ? record.inputSchema : undefined,
    defaultPolicies: record.defaultPolicies as WorkflowGraphConfig["defaultPolicies"],
  };
}

function getWorkflowRecord(record: Record<string, unknown>): Record<string, unknown> {
  const nested = record.workflow;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  if ("name" in record || "start" in record || "maxIterations" in record) {
    return record;
  }
  throw new Error("Workflow config requires workflow object or top-level workflow template fields.");
}

function validateNode(node: unknown, index: number): AgentNode {
  if (!node || typeof node !== "object") throw new Error(`nodes[${index}] must be an object.`);
  const item = node as Record<string, unknown>;
  for (const key of ["id", "type", "role", "inputKeys", "outputKey", "outputSchema"]) {
    if (!(key in item)) throw new Error(`nodes[${index}].${key} is required.`);
  }
  if (typeof item.id !== "string" || !item.id) throw new Error(`nodes[${index}].id must be a string.`);
  if (!NODE_TYPES.includes(String(item.type))) {
    throw new Error(`nodes[${index}].type is unsupported: ${String(item.type)}`);
  }
  if (typeof item.role !== "string" || !item.role) throw new Error(`nodes[${index}].role must be a string.`);
  if (!Array.isArray(item.inputKeys)) throw new Error(`nodes[${index}].inputKeys must be an array.`);
  if (typeof item.outputKey !== "string" || !item.outputKey) {
    throw new Error(`nodes[${index}].outputKey must be a string.`);
  }
  if (typeof item.outputSchema !== "string" || !item.outputSchema) {
    throw new Error(`nodes[${index}].outputSchema must be a string.`);
  }
  if (!isSupportedOutputSchema(item.outputSchema)) {
    throw new Error(`nodes[${index}].outputSchema is unsupported: ${item.outputSchema}`);
  }

  return {
    id: item.id,
    type: item.type,
    role: item.role as AgentNode["role"],
    description: typeof item.description === "string" ? item.description : "",
    inputKeys: item.inputKeys as string[],
    outputKey: item.outputKey as AgentNode["outputKey"],
    outputSchema: item.outputSchema as AgentNode["outputSchema"],
    systemPrompt: typeof item.systemPrompt === "string" ? item.systemPrompt : undefined,
    retryPolicy: item.retryPolicy as AgentNode["retryPolicy"],
    executorConfig: isRecord(item.executorConfig) ? item.executorConfig : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateCondition(condition: unknown, edgeIndex: number): void {
  if (!condition || typeof condition !== "object") {
    throw new Error(`edges[${edgeIndex}].condition must be an object.`);
  }
  const item = condition as Record<string, unknown>;
  if (!["always", "equals", "exists", "notExists", "in"].includes(String(item.type))) {
    throw new Error(`edges[${edgeIndex}].condition.type is unsupported: ${String(item.type)}`);
  }
  if (item.type !== "always" && (typeof item.path !== "string" || !item.path)) {
    throw new Error(`edges[${edgeIndex}].condition.path is required.`);
  }
  if (item.type === "equals" && !("value" in item)) {
    throw new Error(`edges[${edgeIndex}].condition.value is required for equals.`);
  }
  if (item.type === "in" && !Array.isArray(item.value)) {
    throw new Error(`edges[${edgeIndex}].condition.value must be an array for in.`);
  }
}
