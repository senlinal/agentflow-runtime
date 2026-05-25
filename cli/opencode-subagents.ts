import { OpenCodeSubAgentBridge } from "../core/opencode/OpenCodeSubAgentBridge.ts";

const status = await new OpenCodeSubAgentBridge().inspectConfig();

console.log("AgentFlow OpenCode native subagents");
console.log("");
console.log(`mapping: ${status.mappingPath}`);
console.log(`programmaticDispatchSupported: ${status.programmaticDispatchSupported}`);
console.log(`canReadTaskId: ${status.canReadTaskId}`);
console.log(`canReadSessionId: ${status.canReadSessionId}`);
console.log("");
console.log("Configured agents:");
for (const agent of status.configuredAgents) {
  console.log(`- ${agent.role}: @${agent.openCodeAgentName} (${agent.exists ? "present" : "missing"})`);
  console.log(`  config: ${agent.configPath}`);
}
console.log("");
console.log("Limitations:");
for (const limitation of status.limitations) {
  console.log(`- ${limitation}`);
}
