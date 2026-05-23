import { RoleCatalog } from "./RoleCatalog.ts";
import { isSupportedOutputSchema } from "./OutputSchemaRegistry.ts";
import type { AgentNode, WorkflowGraphConfig } from "./types.ts";

const CONDITION_TYPES = ["always", "equals", "exists", "notExists", "in"];
const NODE_TYPES = ["mock", "llm", "negotiate", "scopeGate", "code", "test", "verify", "repair", "approval", "materialize", "executionApproval", "executionDryRun", "execution"];

export class WorkflowTemplateValidator {
  static validate(raw: unknown): WorkflowGraphConfig {
    const parsed = parseTemplateHeader(raw);
    const nodes = parsed.nodes.map((node, index) => validateFullNode(node, index));
    return validateResolvedTemplate(parsed.record, parsed.workflow, nodes);
  }

  static async validateWithRoleCatalog(raw: unknown, roleCatalog = new RoleCatalog()): Promise<WorkflowGraphConfig> {
    const parsed = parseTemplateHeader(raw);
    const nodes = await Promise.all(
      parsed.nodes.map((node, index) => validateNodeWithPreset(node, index, roleCatalog)),
    );
    return validateResolvedTemplate(parsed.record, parsed.workflow, nodes);
  }
}

function parseTemplateHeader(raw: unknown): {
  record: Record<string, unknown>;
  workflow: Record<string, unknown>;
  nodes: unknown[];
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Workflow template must be a JSON object.");
  }
  const record = raw as Record<string, unknown>;
  const workflow = normalizeWorkflow(record);
  if (typeof workflow.name !== "string" || !workflow.name) throw new Error("workflow.name is required.");
  if (typeof workflow.start !== "string" || !workflow.start) throw new Error("workflow.start is required.");
  if (!Number.isInteger(workflow.maxIterations) || Number(workflow.maxIterations) <= 0) {
    throw new Error("workflow.maxIterations must be a positive integer.");
  }
  if (!record.defaultPolicies || typeof record.defaultPolicies !== "object") {
    throw new Error("workflow template defaultPolicies is required.");
  }
  if (!Array.isArray(record.nodes) || record.nodes.length === 0) {
    throw new Error("workflow template nodes must be a non-empty array.");
  }
  if (!Array.isArray(record.edges)) throw new Error("workflow template edges must be an array.");
  return { record, workflow, nodes: record.nodes };
}

function validateResolvedTemplate(
  record: Record<string, unknown>,
  workflow: Record<string, unknown>,
  nodes: AgentNode[],
): WorkflowGraphConfig {
  const seen = new Set<string>();
  for (const node of nodes) {
    if (seen.has(node.id)) throw new Error(`Duplicate node id: ${node.id}`);
    seen.add(node.id);
  }

  const start = workflow.start as string;
  if (!seen.has(start)) throw new Error(`workflow.start node does not exist: ${start}`);

  const edges = (record.edges as unknown[]).map((edge, index) => {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) throw new Error(`edges[${index}] must be an object.`);
    const item = edge as Record<string, unknown>;
    if (typeof item.from !== "string" || !item.from) throw new Error(`edges[${index}].from is required.`);
    if (typeof item.to !== "string" || !item.to) throw new Error(`edges[${index}].to is required.`);
    if (!seen.has(item.from)) throw new Error(`edges[${index}].from does not exist: ${item.from}`);
    if (item.to !== "end" && !seen.has(item.to)) throw new Error(`edges[${index}].to does not exist: ${item.to}`);
    validateCondition(item.condition, index);
    return item as WorkflowGraphConfig["edges"][number];
  });

  return {
    workflow: {
      name: workflow.name as string,
      version: typeof workflow.version === "string" ? workflow.version : undefined,
      description: typeof workflow.description === "string" ? workflow.description : undefined,
      start,
      maxIterations: Number(workflow.maxIterations),
    },
    nodes,
    edges,
    inputSchema: typeof record.inputSchema === "string" ? record.inputSchema : undefined,
    defaultPolicies: record.defaultPolicies as WorkflowGraphConfig["defaultPolicies"],
  };
}

async function validateNodeWithPreset(node: unknown, index: number, roleCatalog: RoleCatalog): Promise<AgentNode> {
  const item = requireNodeObject(node, index);
  if (typeof item.rolePreset === "string" && item.rolePreset) {
    const role = await roleCatalog.getRoleById(item.rolePreset);
    const fullNode = {
      id: typeof item.id === "string" && item.id ? item.id : presetToNodeId(item.rolePreset),
      rolePreset: item.rolePreset,
      type: item.type ?? role.defaultType,
      role: item.role ?? role.role,
      description: item.description ?? role.description,
      inputKeys: item.inputKeys ?? role.defaultInputKeys,
      outputKey: item.outputKey ?? role.defaultOutputKey,
      outputSchema: item.outputSchema ?? role.outputSchema,
      systemPrompt: item.systemPrompt ?? role.defaultSystemPrompt,
      retryPolicy: item.retryPolicy,
      executorConfig: item.executorConfig,
    };
    return validateFullNode(fullNode, index);
  }
  return validateFullNode(item, index);
}

function validateFullNode(node: unknown, index: number): AgentNode {
  const item = requireNodeObject(node, index);
  for (const key of ["id", "type", "role", "inputKeys", "outputKey", "outputSchema"]) {
    if (!(key in item)) throw new Error(`nodes[${index}].${key} is required.`);
  }
  if (typeof item.id !== "string" || !item.id) throw new Error(`nodes[${index}].id must be a string.`);
  if (!NODE_TYPES.includes(String(item.type))) {
    throw new Error(`nodes[${index}].type is unsupported: ${String(item.type)}`);
  }
  if (typeof item.role !== "string" || !item.role) throw new Error(`nodes[${index}].role must be a string.`);
  if (!Array.isArray(item.inputKeys)) throw new Error(`nodes[${index}].inputKeys must be an array.`);
  if (typeof item.outputKey !== "string" || !item.outputKey) throw new Error(`nodes[${index}].outputKey must be a string.`);
  if (typeof item.outputSchema !== "string" || !item.outputSchema) throw new Error(`nodes[${index}].outputSchema is required.`);
  if (!isSupportedOutputSchema(item.outputSchema)) {
    throw new Error(`nodes[${index}].outputSchema is unsupported: ${item.outputSchema}`);
  }

  return {
    id: item.id,
    rolePreset: typeof item.rolePreset === "string" ? item.rolePreset : undefined,
    type: item.type as AgentNode["type"],
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

function requireNodeObject(node: unknown, index: number): Record<string, unknown> {
  if (!node || typeof node !== "object" || Array.isArray(node)) throw new Error(`nodes[${index}] must be an object.`);
  return node as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeWorkflow(record: Record<string, unknown>): Record<string, unknown> {
  if (record.workflow && typeof record.workflow === "object" && !Array.isArray(record.workflow)) {
    return record.workflow as Record<string, unknown>;
  }
  return record;
}

function validateCondition(condition: unknown, edgeIndex: number): void {
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) {
    throw new Error(`edges[${edgeIndex}].condition must be an object.`);
  }
  const item = condition as Record<string, unknown>;
  if (!CONDITION_TYPES.includes(String(item.type))) {
    throw new Error(`edges[${edgeIndex}].condition.type is unsupported: ${String(item.type)}`);
  }
  if (item.type !== "always" && (typeof item.path !== "string" || !item.path)) {
    throw new Error(`edges[${edgeIndex}].condition.path is required.`);
  }
  if (item.type === "equals" && !("value" in item)) throw new Error(`edges[${edgeIndex}].condition.value is required for equals.`);
  if (item.type === "in" && !Array.isArray(item.value)) throw new Error(`edges[${edgeIndex}].condition.value must be an array for in.`);
}

function presetToNodeId(preset: string): string {
  return preset.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}
