import { NativeSubAgentWorkflowPackBuilder, displayTask } from "../core/opencode/NativeSubAgentWorkflowPackBuilder.ts";
import { parseArgs } from "./args.ts";

const args = parseArgs(process.argv.slice(2));
const profileId = args.profile ?? "agent-workforce-basic";
const task = args.task;
if (!task) {
  console.error("Usage: npm run workflow:native-pack -- --profile agent-workforce-basic --task \"解释一下咖啡的做法\"");
  process.exit(1);
}

const pack = await new NativeSubAgentWorkflowPackBuilder().build({ profileId, task });

console.log("AgentFlow OpenCode Native Subagent Workflow Pack created");
console.log("");
console.log(`runId: ${pack.runId}`);
console.log(`dispatchInstructionsPath: ${pack.dispatchInstructionsPath}`);
console.log(`manifestPath: ${pack.manifestPath}`);
console.log(`tasks: ${pack.tasks.length}`);
for (const nativeTask of pack.tasks) {
  console.log(`- ${displayTask(nativeTask)}`);
  console.log(`  prompt: ${nativeTask.promptPath}`);
  console.log(`  output: ${nativeTask.outputArtifactPath}`);
}
console.log("");
console.log("Next steps in OpenCode:");
console.log(`1. Open ${pack.dispatchInstructionsPath}`);
console.log("2. Create each listed @agentflow-* native subagent task in dependency order.");
console.log("3. Ensure each subagent writes its output.json.");
console.log(`4. Run: npm run workflow:native-collect -- --run ${pack.runId}`);
