import { parseArgs } from "./args.ts";
import { WorkflowTemplateRegistry } from "../core/WorkflowTemplateRegistry.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.template) throw new Error("Missing --template");

const { config, path } = await new WorkflowTemplateRegistry().load(args.template);
console.log(`OK ${config.workflow.name} ${config.workflow.version ?? "unknown"} ${path}`);
