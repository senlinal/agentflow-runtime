import { NativeSubAgentWorkflowPackCollector } from "../core/opencode/NativeSubAgentWorkflowPackCollector.ts";
import { parseArgs } from "./args.ts";

const args = parseArgs(process.argv.slice(2));
const runId = args.run;
if (!runId) {
  console.error("Usage: npm run workflow:native-collect -- --run <runId>");
  process.exit(1);
}

const result = await new NativeSubAgentWorkflowPackCollector().collect({ runId });

console.log("AgentFlow OpenCode Native Subagent Collect");
console.log("");
console.log(`runId: ${result.runId}`);
console.log(`status: ${result.status}`);
console.log(`completed: ${result.completedCount}`);
console.log(`pending: ${result.pendingCount}`);
console.log(`failed: ${result.failedCount}`);
console.log(`summaryPath: ${result.summaryPath}`);
console.log(`tracePath: ${result.tracePath}`);
console.log("");
console.log("Role Timeline:");
for (const event of result.roleTimeline) {
  console.log(`${event.role}`);
  console.log(`  source: ${event.source}`);
  console.log(`  openCodeAgentName: ${event.openCodeAgentName}`);
  console.log(`  input: ${event.inputArtifactPath}`);
  console.log(`  output: ${event.outputArtifactPath}`);
  console.log(`  status: ${event.status}`);
  console.log(`  reason: ${event.summary}`);
}
if (result.missingOutputs.length > 0) {
  console.log("");
  console.log("Missing outputs:");
  for (const item of result.missingOutputs) {
    console.log(`- ${item.role}: ${item.outputArtifactPath}`);
  }
}
if (result.warnings.length > 0) {
  console.log("");
  console.log("Warnings:");
  for (const warning of result.warnings) console.log(`- ${warning}`);
}
