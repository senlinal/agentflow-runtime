import { parseArgs } from "./args.ts";
import { TaskBriefLoader } from "../core/TaskBriefLoader.ts";
import { WorkflowRunner } from "../core/WorkflowRunner.ts";
import { WorkflowTemplateRegistry } from "../core/WorkflowTemplateRegistry.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.template) throw new Error("Missing --template");
if (!args.input) throw new Error("Missing --input");

const registry = new WorkflowTemplateRegistry();
const { config, path } = await registry.load(args.template);
const taskBrief = await TaskBriefLoader.loadJson(args.input);
const result = await new WorkflowRunner().run(config, taskBrief);
const context = result.context;
const enteredExecutor = context.trace.some((item) => item.nodeId === "executor");
const finalStatus = context.stopReason ? "stopped" : context.verification?.pass ? "passed" : "not-passed";

console.log(JSON.stringify({
  template: config.workflow.name,
  templateVersion: config.workflow.version ?? null,
  templatePath: path,
  input: args.input,
  runId: result.runId,
  finalStatus,
  feasibilityDecision: context.feasibilityReport?.decision ?? null,
  enteredExecutor,
  summaryPath: result.summaryPath,
  tracePath: result.tracePath,
}, null, 2));
