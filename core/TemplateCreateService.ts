import { access, writeFile } from "node:fs/promises";
import { TemplateScaffolder, type TemplateScaffoldOverrides } from "./TemplateScaffolder.ts";
import { WorkflowTemplateRegistry } from "./WorkflowTemplateRegistry.ts";
import type { WorkflowGraphConfig } from "./types.ts";

export type TemplateCreateOptions = TemplateScaffoldOverrides & {
  specPath: string;
  outPath: string;
  force?: boolean;
};

export type TemplateCreateResult = {
  out: string;
  name: string;
  version: string | null;
  nodes: number;
  edges: number;
  template: WorkflowGraphConfig;
};

export class TemplateCreateService {
  private readonly scaffolder: TemplateScaffolder;
  private readonly registry: WorkflowTemplateRegistry;

  constructor(scaffolder = new TemplateScaffolder(), registry = new WorkflowTemplateRegistry()) {
    this.scaffolder = scaffolder;
    this.registry = registry;
  }

  async create(options: TemplateCreateOptions): Promise<TemplateCreateResult> {
    if (!options.force && await exists(options.outPath)) {
      throw new Error(`Output file already exists: ${options.outPath}. If you want to overwrite it, pass --force.`);
    }

    const template = await this.scaffolder.scaffoldFromFile(options.specPath, {
      name: options.name,
      description: options.description,
      version: options.version,
    });

    await this.assertNoNameConflict(template.workflow.name, options.outPath, options.force === true);
    await writeFile(options.outPath, `${JSON.stringify(toSerializableTemplate(template), null, 2)}\n`, "utf8");

    return {
      out: options.outPath,
      name: template.workflow.name,
      version: template.workflow.version ?? null,
      nodes: template.nodes.length,
      edges: template.edges.length,
      template,
    };
  }

  private async assertNoNameConflict(name: string, outPath: string, force: boolean): Promise<void> {
    const entries = await this.registry.listTemplates();
    const conflicts = entries.filter((entry) => entry.name === name && entry.sourcePath !== outPath);
    if (conflicts.length > 0) {
      throw new Error(
        `Workflow template name already exists: ${name}. Conflicting files: ${conflicts
          .map((entry) => entry.sourcePath)
          .join(", ")}. Use --name to choose a unique name.`,
      );
    }
    if (!force) return;
  }
}

function toSerializableTemplate(template: WorkflowGraphConfig): Record<string, unknown> {
  return {
    name: template.workflow.name,
    version: template.workflow.version,
    description: template.workflow.description,
    start: template.workflow.start,
    maxIterations: template.workflow.maxIterations,
    inputSchema: template.inputSchema,
    defaultPolicies: template.defaultPolicies,
    nodes: template.nodes,
    edges: template.edges,
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
