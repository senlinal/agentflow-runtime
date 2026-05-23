import { readFile } from "node:fs/promises";
import { RoleCatalog } from "./RoleCatalog.ts";
import type { AgentNode, WorkflowGraphConfig, WorkflowPolicies } from "./types.ts";
import { WorkflowTemplateValidator } from "./WorkflowTemplateValidator.ts";

export type TemplateSpec = {
  name: string;
  version: string;
  description: string;
  start: string;
  maxIterations: number;
  inputSchema?: string;
  rolePresets: string[];
  edges: WorkflowGraphConfig["edges"];
  defaultPolicies?: WorkflowPolicies;
};

export type TemplateScaffoldOverrides = {
  name?: string;
  description?: string;
  version?: string;
};

export class TemplateScaffolder {
  private readonly roleCatalog: RoleCatalog;

  constructor(roleCatalog = new RoleCatalog()) {
    this.roleCatalog = roleCatalog;
  }

  async scaffoldFromFile(path: string, overrides: TemplateScaffoldOverrides = {}): Promise<WorkflowGraphConfig> {
    const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
    return this.scaffold(raw, overrides);
  }

  async scaffold(raw: unknown, overrides: TemplateScaffoldOverrides = {}): Promise<WorkflowGraphConfig> {
    const spec = validateSpec(raw);
    const nodes: AgentNode[] = [];
    for (const preset of spec.rolePresets) {
      const role = await this.roleCatalog.getRoleById(preset);
      nodes.push({
        id: presetToNodeId(preset),
        rolePreset: preset,
        type: role.defaultType,
        role: role.role,
        description: role.description,
        inputKeys: role.defaultInputKeys,
        outputKey: role.defaultOutputKey,
        outputSchema: role.outputSchema,
        systemPrompt: role.defaultSystemPrompt,
      });
    }

    const template = {
      workflow: {
        name: overrides.name ?? spec.name,
        version: overrides.version ?? spec.version,
        description: overrides.description ?? spec.description,
        start: spec.start,
        maxIterations: spec.maxIterations,
      },
      inputSchema: spec.inputSchema,
      defaultPolicies: spec.defaultPolicies ?? defaultPolicies(),
      nodes,
      edges: spec.edges,
    };
    return WorkflowTemplateValidator.validate(template);
  }
}

export function presetToNodeId(preset: string): string {
  return preset.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function validateSpec(raw: unknown): TemplateSpec {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Template spec must be an object.");
  const record = raw as Record<string, unknown>;
  for (const key of ["name", "version", "description", "start", "maxIterations", "rolePresets", "edges"]) {
    if (!(key in record)) throw new Error(`template spec ${key} is required.`);
  }
  if (!Array.isArray(record.rolePresets) || record.rolePresets.length === 0) {
    throw new Error("template spec rolePresets must be a non-empty array.");
  }
  if (!Array.isArray(record.edges)) throw new Error("template spec edges must be an array.");
  return {
    name: requireString(record, "name"),
    version: requireString(record, "version"),
    description: requireString(record, "description"),
    start: requireString(record, "start"),
    maxIterations: Number(record.maxIterations),
    inputSchema: typeof record.inputSchema === "string" ? record.inputSchema : undefined,
    rolePresets: record.rolePresets as string[],
    edges: record.edges as WorkflowGraphConfig["edges"],
    defaultPolicies: record.defaultPolicies as WorkflowPolicies,
  };
}

function requireString(record: Record<string, unknown>, key: string): string {
  if (typeof record[key] !== "string" || !record[key]) throw new Error(`template spec ${key} must be a string.`);
  return record[key] as string;
}

function defaultPolicies(): WorkflowPolicies {
  return {
    permissionPolicy: {
      allowWithoutConfirmation: ["edit project files", "create files", "run local tests", "run local demos"],
      requireConfirmation: ["delete existing project files", "large rewrites", "external paid API calls"],
      forbiddenWithoutExplicitApproval: ["git reset --hard", "git clean -fd", "deploy", "production data changes"],
    },
    costPolicy: {
      maxCostLevel: "medium",
      stopWhen: ["scope too large", "cost high", "risk high"],
      preferredDecisionsWhenOverBudget: ["ask_human", "revise_goal", "stop"],
    },
    qualityPolicy: {
      principles: ["quality over speed", "configuration-driven runtime", "schema-validated outputs"],
      requiredChecks: ["npm run test", "npm run typecheck"],
      forbiddenShortcuts: ["hardcoded runtime flow", "deleting tests", "swallowing errors"],
    },
  };
}
