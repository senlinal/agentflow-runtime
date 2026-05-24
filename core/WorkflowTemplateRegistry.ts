import { readdir, readFile } from "node:fs/promises";
import { basename, isAbsolute, join, normalize, relative } from "node:path";
import { agentFlowPath, agentFlowRoot } from "./AgentFlowPaths.ts";
import { WorkflowGraph } from "./WorkflowGraph.ts";
import { WorkflowTemplateValidator } from "./WorkflowTemplateValidator.ts";
import type { WorkflowGraphConfig } from "./types.ts";

export type WorkflowTemplateEntry = {
  name: string;
  version: string;
  description: string;
  path: string;
  sourcePath: string;
  duplicate: boolean;
};

export class WorkflowTemplateRegistry {
  private readonly workflowsDir: string;

  constructor(workflowsDir = agentFlowPath("workflows")) {
    this.workflowsDir = workflowsDir;
  }

  async listTemplates(): Promise<WorkflowTemplateEntry[]> {
    const files = await this.templateFiles();
    const loaded = await Promise.all(files.map(async (path) => ({ path, config: await this.loadConfigFromPath(path) })));
    const counts = countNames(loaded.map((item) => item.config.workflow.name));
    return loaded
      .map(({ path, config }) => ({
        name: config.workflow.name,
        version: config.workflow.version ?? "unknown",
        description: config.workflow.description ?? "",
        path: displayPath(path),
        sourcePath: displayPath(path),
        duplicate: (counts.get(config.workflow.name) ?? 0) > 1,
      }))
      .sort((left, right) => left.name.localeCompare(right.name) || left.sourcePath.localeCompare(right.sourcePath));
  }

  async load(template: string): Promise<{ graph: WorkflowGraph; config: WorkflowGraphConfig; path: string; sourcePath: string }> {
    const sourcePath = await this.resolveTemplatePath(template);
    const config = await this.loadConfigFromPath(sourcePath);
    return { graph: new WorkflowGraph(config), config, path: displayPath(sourcePath), sourcePath: displayPath(sourcePath) };
  }

  async resolveTemplatePath(template: string): Promise<string> {
    const files = await this.templateFiles();
    const normalizedTemplate = normalize(template);

    const pathMatch = files.find((path) => normalize(path) === normalizedTemplate);
    if (pathMatch) return pathMatch;

    if (!isAbsolute(template) && normalize(template).includes("/")) {
      const rootedTemplate = normalize(agentFlowPath(template));
      const rootedPathMatch = files.find((path) => normalize(path) === rootedTemplate);
      if (rootedPathMatch) return rootedPathMatch;
    }

    const fileMatch = files.find((path) => {
      const fileName = basename(path);
      return fileName === template || fileName === `${template}.json`;
    });
    if (fileMatch) return fileMatch;

    const nameMatches: string[] = [];
    for (const path of files) {
      const config = await this.loadConfigFromPath(path);
      if (config.workflow.name === template) nameMatches.push(path);
    }
    if (nameMatches.length > 1) {
      throw new Error(`Duplicate workflow template name: ${template}. Matching files: ${nameMatches.join(", ")}`);
    }
    if (nameMatches.length === 1) return nameMatches[0];

    throw new Error(`Workflow template not found: ${template}`);
  }

  async duplicateNames(): Promise<Map<string, string[]>> {
    const duplicates = new Map<string, string[]>();
    for (const entry of await this.listTemplates()) {
      const paths = duplicates.get(entry.name) ?? [];
      paths.push(entry.sourcePath);
      duplicates.set(entry.name, paths);
    }
    for (const [name, paths] of duplicates) {
      if (paths.length < 2) duplicates.delete(name);
    }
    return duplicates;
  }

  private async templateFiles(): Promise<string[]> {
    const entries = await readdir(this.workflowsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => join(this.workflowsDir, entry.name));
  }

  private async loadConfigFromPath(path: string): Promise<WorkflowGraphConfig> {
    const raw = await readFile(path, "utf8");
    return WorkflowTemplateValidator.validateWithRoleCatalog(JSON.parse(raw));
  }
}

function countNames(names: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return counts;
}

function displayPath(path: string): string {
  const root = agentFlowRoot();
  const relativePath = relative(root, path);
  if (!relativePath.startsWith("..") && !isAbsolute(relativePath)) return relativePath;
  return path;
}
