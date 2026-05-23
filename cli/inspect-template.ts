import { parseArgs } from "./args.ts";
import { WorkflowTemplateRegistry } from "../core/WorkflowTemplateRegistry.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.template) throw new Error("Missing --template");

const { config, sourcePath } = await new WorkflowTemplateRegistry().load(args.template);
console.log(JSON.stringify({
  name: config.workflow.name,
  version: config.workflow.version ?? null,
  description: config.workflow.description ?? "",
  sourcePath,
  start: config.workflow.start,
  maxIterations: config.workflow.maxIterations,
  inputSchema: config.inputSchema ?? null,
  policies: config.defaultPolicies ?? null,
  nodes: config.nodes.map((node) => ({
    id: node.id,
    rolePreset: node.rolePreset ?? null,
    role: node.role,
    outputSchema: node.outputSchema,
    inputKeys: node.inputKeys,
    outputKey: node.outputKey,
  })),
  edges: config.edges,
}, null, 2));
