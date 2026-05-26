import { access } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  ".opencode/commands/workflow-help.md",
  ".opencode/commands/workflow-cli.md",
  ".opencode/commands/workflow-profile.md",
  ".opencode/tools/run-workflow.ts",
  ".opencode/tools/run-profile-workflow.ts",
  ".opencode/tools/run_profile_workflow.ts",
  ".opencode/plugins/agentflow-policy.ts",
  ".opencode/plugins/agentflow-workflow-interceptor.ts",
  ".opencode/agents/agentflow-planner.md",
  ".opencode/agents/agentflow-debater.md",
  ".opencode/agents/agentflow-planner-revision.md",
  ".opencode/agents/agentflow-executor.md",
  ".opencode/agents/agentflow-verifier.md",
  ".opencode/agents/agentflow-goalkeeper.md",
  "config/opencode-subagents.json",
  "core/opencode/OpenCodeSubAgentBridge.ts",
  "core/opencode/NativeSubAgentWorkflowPackBuilder.ts",
  "core/opencode/NativeSubAgentWorkflowPackCollector.ts",
  "cli/opencode-subagents.ts",
  "cli/native-subagent-pack.ts",
  "cli/native-subagent-collect.ts",
  "adapters/opencode/PolicyAuditLogger.ts",
  "adapters/opencode/PolicyApprovalStore.ts",
  "adapters/opencode/ToolCallHasher.ts",
  "adapters/opencode/ApprovalReplayService.ts",
  "adapters/opencode/PolicyReplayRunner.ts",
  "adapters/opencode/PolicyLogReader.ts",
  "adapters/opencode/PolicyTimelineService.ts",
  "cli/policy-replay-check.ts",
  "cli/policy-replay.ts",
  "cli/policy-replay-history.ts",
  "docs/OPENCODE_ADAPTER.md",
  "docs/OPENCODE_TOOL_REGISTRATION.md",
  "docs/OPENCODE_MCP_AGENTFLOW.md",
  "docs/OPENCODE_WORKFLOW_INTERNAL.md",
  "docs/LLM_ADAPTER.md",
  "docs/AGENT_POLICY.md",
  "AGENTS.md",
  "opencode.json",
  "mcp/agentflow-mcp-server.ts",
  "mcp/agentflow-server.ts",
  "mcp/tools/run-profile-workflow.ts",
  "mcp/tools/native-pack.ts",
  "mcp/tools/native-collect.ts",
  "mcp/tools/list-profiles.ts",
  "mcp/tools/inspect-profile.ts",
  "mcp/tools/show-last-run.ts",
  "profiles/current.json",
  "profiles/rag-optimization.json",
  "profiles/coding-safe-fix.json",
  "profiles/external-project-fix.json",
  "profiles/frontend-site-build.json",
  "profiles/agent-workforce-basic.json",
  "profiles/agent-workforce-llm.json",
  "profiles/agent-workforce-opencode.json",
  "core/profile/ProfileRouter.ts",
  "core/profile/ProfileRunFormatter.ts",
  "core/profile/RuntimeTraceRoleExtractor.ts",
  "core/profile/ProjectMemoryStore.ts",
  "core/profile/MemoryAutonomyGate.ts",
  "core/profile/EscalationGate.ts",
  "cli/project-memory-list.ts",
  "cli/project-memory-summary.ts",
  "cli/project-memory-compact.ts",
  "cli/project-memory-autonomy.ts",
  "cli/opencode-workflow-command.ts",
  "scripts/opencode-install-global.ts",
  "docs/PROJECT_MEMORY.md",
  "docs/OPENCODE_NATIVE_SUBAGENTS.md",
  "docs/OPENCODE_NATIVE_WORKFLOW_PACK.md",
];

const missing: string[] = [];
for (const file of requiredFiles) {
  try {
    await access(file);
  } catch {
    missing.push(file);
  }
}

if (missing.length > 0) {
  console.error(`Missing opencode adapter files: ${missing.join(", ")}`);
  process.exit(1);
}

const gitignore = readFileSync(".gitignore", "utf8");
if (!gitignore.split("\n").includes(".opencode/policy-runs/")) {
  console.error("Missing .opencode/policy-runs/ in .gitignore");
  process.exit(1);
}
if (!gitignore.split("\n").includes(".agentflow/project-memory/")) {
  console.error("Missing .agentflow/project-memory/ in .gitignore");
  process.exit(1);
}

if (existsSync(".opencode/commands/workflow.md")) {
  console.error("Executable markdown /workflow command still exists: .opencode/commands/workflow.md");
  process.exit(1);
}
const workflowHelp = readFileSync(".opencode/commands/workflow-help.md", "utf8");
for (const requiredText of ["/workflow <task>", "/agentflow <task>", "agent-workforce-basic", "<auto-slash-command>"]) {
  if (!workflowHelp.includes(requiredText)) {
    console.error(`workflow-help.md does not document the plugin-owned entry: ${requiredText}`);
    process.exit(1);
  }
}

for (const forbiddenText of ["todowrite", "list_files", "Research Plan", "Command Instructions", "search-mode", "AGENTFLOW_PROJECT_ROOT", "opencode-workflow-command.ts", "!`", "agentflow_run_profile_workflow", "run_profile_workflow"]) {
  if (workflowHelp.includes(forbiddenText)) {
    console.error(`workflow-help.md appears to expose or require forbidden behavior: ${forbiddenText}`);
    process.exit(1);
  }
}

const runProfileTool = readFileSync(".opencode/tools/run_profile_workflow.ts", "utf8");
for (const requiredText of ["runProfileWorkflow", "OpenCodeWorkflowToolService", "Compatibility wrapper"]) {
  if (!runProfileTool.includes(requiredText)) {
    console.error(`run_profile_workflow compatibility wrapper is missing expected text: ${requiredText}`);
    process.exit(1);
  }
}
for (const forbiddenText of ['@opencode-ai/plugin', "export default tool({", "tool.schema"]) {
  if (runProfileTool.includes(forbiddenText)) {
    console.error(`run_profile_workflow should not register a duplicate OpenCode custom tool: ${forbiddenText}`);
    process.exit(1);
  }
}

const opencodeConfig = readFileSync("opencode.json", "utf8");
for (const requiredText of [
  '"plugin"',
  '"./.opencode/plugins/agentflow-policy.ts"',
  '"./.opencode/plugins/agentflow-workflow-interceptor.ts"',
  '"mcp"',
  '"agentflow"',
  '"AGENTFLOW_PROJECT_ROOT=."',
  '"mcp/agentflow-mcp-server.ts"',
  '"bash": "ask"',
  '"edit": "ask"',
  '"~/development/garbage_item_upload/**": "allow"',
  '"/Users/*/development/garbage_item_upload/**": "allow"',
]) {
  if (!opencodeConfig.includes(requiredText)) {
    console.error(`opencode.json is missing expected AgentFlow MCP or permission setting: ${requiredText}`);
    process.exit(1);
  }
}
if (opencodeConfig.includes("opencode-workflow-command.ts") || opencodeConfig.includes("AGENTFLOW_PROJECT_ROOT=\\\"${AGENTFLOW_PROJECT_ROOT")) {
  console.error("opencode.json workflow command still appears to contain the old shell shim");
  process.exit(1);
}
const parsedOpenCodeConfig = JSON.parse(opencodeConfig) as { command?: Record<string, { template?: string; description?: string; subtask?: boolean }> };
for (const commandName of ["workflow", "agentflow", "workflow-llm", "agentflow-llm"]) {
  const command = parsedOpenCodeConfig.command?.[commandName];
  if (!command || command.subtask !== false) {
    console.error(`opencode.json must register /${commandName} as a non-subtask AgentFlow command`);
    process.exit(1);
  }
  const template = command.template ?? "";
  for (const requiredText of ["$ARGUMENTS", "agentflow_run_profile_workflow", "formattedText", "allowExecution=false", "Do not call CodeExecutor", "Do not call agentflow_list_profiles"]) {
    if (!template.includes(requiredText)) {
      console.error(`opencode.json /${commandName} command template is missing expected MCP display text: ${requiredText}`);
      process.exit(1);
    }
  }
  if (template.includes("{{args}}")) {
    console.error(`opencode.json /${commandName} uses unsupported literal {{args}} instead of $ARGUMENTS`);
    process.exit(1);
  }
  const isLLMCommand = commandName.endsWith("-llm");
  const expectedProfile = isLLMCommand ? "agent-workforce-llm" : "agent-workforce-basic";
  const expectedAllowLLM = isLLMCommand ? "allowLLM=true" : "allowLLM=false";
  if (!template.includes(`profile \`${expectedProfile}\``) || !template.includes(expectedAllowLLM)) {
    console.error(`opencode.json /${commandName} does not use the expected deterministic profile and LLM setting`);
    process.exit(1);
  }
}
if (parsedOpenCodeConfig.command?.workflow?.template?.includes("opencode-workflow-command.ts")) {
  console.error("opencode.json command.workflow must not contain shell shims");
  process.exit(1);
}

const mcpServer = readFileSync("mcp/agentflow-mcp-server.ts", "utf8");
for (const requiredText of [
  "tools/list",
  "tools/call",
  "agentflow_run_profile_workflow",
  "agentflow_list_profiles",
  "agentflow_inspect_profile",
  "agentflow_show_last_run",
  "agentflow_native_pack",
  "agentflow_native_collect",
  "structuredContent",
]) {
  if (!mcpServer.includes(requiredText)) {
    console.error(`AgentFlow MCP server is missing expected text: ${requiredText}`);
    process.exit(1);
  }
}

const policyPlugin = readFileSync(".opencode/plugins/agentflow-policy.ts", "utf8");
for (const requiredText of ["export async function AgentFlowPolicy", "tool.execute.before"]) {
  if (!policyPlugin.includes(requiredText)) {
    console.error(`agentflow policy plugin is missing OpenCode function export text: ${requiredText}`);
    process.exit(1);
  }
}

const workflowInterceptor = readFileSync(".opencode/plugins/agentflow-workflow-interceptor.ts", "utf8");
for (const requiredText of [
  "export async function AgentFlowWorkflowInterceptor",
  "chat.message",
  "command.execute.before",
  "tool.execute.after",
  "experimental.text.complete",
  "COMMANDS",
  "agentflow_run_profile_workflow",
]) {
  if (!workflowInterceptor.includes(requiredText)) {
    console.error(`agentflow workflow interceptor is missing expected text: ${requiredText}`);
    process.exit(1);
  }
}
for (const forbiddenPluginExport of ["export const id", "export const server", "export default"]) {
  if (policyPlugin.includes(forbiddenPluginExport) || workflowInterceptor.includes(forbiddenPluginExport)) {
    console.error(`OpenCode plugin files must only export plugin functions; found forbidden export text: ${forbiddenPluginExport}`);
    process.exit(1);
  }
}
const workflowInterceptorCore = readFileSync("adapters/opencode/AgentFlowWorkflowInterceptorCore.ts", "utf8");
for (const requiredText of ["parseAgentFlowEntry", "parseWorkflowCommand", "buildToolInstruction", "fallbackText", "extractFormattedText", "agent-workforce-basic", "agentflow_native_pack", "agentflow_native_collect", "AgentFlow Runtime was not started."]) {
  if (!workflowInterceptorCore.includes(requiredText)) {
    console.error(`agentflow workflow interceptor core is missing expected helper text: ${requiredText}`);
    process.exit(1);
  }
}
for (const forbiddenText of ["todowrite", "list_files", "Research Plan", "search-mode"]) {
  if (workflowInterceptor.includes(forbiddenText) || workflowInterceptorCore.includes(forbiddenText)) {
    console.error(`agentflow workflow interceptor includes forbidden supervisor behavior: ${forbiddenText}`);
    process.exit(1);
  }
}

const opencodeSubagentMapping = JSON.parse(readFileSync("config/opencode-subagents.json", "utf8")) as Record<string, string>;
for (const [role, agentName] of Object.entries({
  Planner: "agentflow-planner",
  Debater: "agentflow-debater",
  PlannerRevision: "agentflow-planner-revision",
  Executor: "agentflow-executor",
  Verifier: "agentflow-verifier",
  GoalKeeper: "agentflow-goalkeeper",
})) {
  if (opencodeSubagentMapping[role] !== agentName) {
    console.error(`config/opencode-subagents.json maps ${role} incorrectly`);
    process.exit(1);
  }
  if (!existsSync(`.opencode/agents/${agentName}.md`)) {
    console.error(`Missing OpenCode native subagent config for ${role}: ${agentName}`);
    process.exit(1);
  }
}
const nativeSubagentDocs = readFileSync("docs/OPENCODE_NATIVE_SUBAGENTS.md", "utf8");
for (const requiredText of ["programmatic dispatch", "unavailable", "openCodeTaskId", "AgentFlow internal subagent", "OpenCode native subagent"]) {
  if (!nativeSubagentDocs.includes(requiredText)) {
    console.error(`OpenCode native subagent docs are missing required limitation text: ${requiredText}`);
    process.exit(1);
  }
}
const nativeBridge = readFileSync("core/opencode/OpenCodeSubAgentBridge.ts", "utf8");
for (const requiredText of ["status: \"unavailable\"", "programmatic subagent dispatch API", "openCodeTaskId", "inspectConfig"]) {
  if (!nativeBridge.includes(requiredText)) {
    console.error(`OpenCodeSubAgentBridge is missing required explicit limitation behavior: ${requiredText}`);
    process.exit(1);
  }
}
const nativePackDocs = readFileSync("docs/OPENCODE_NATIVE_WORKFLOW_PACK.md", "utf8");
for (const requiredText of ["workflow:native-pack", "workflow:native-collect", "DISPATCH.md", "output.json", "opencode_native_artifact"]) {
  if (!nativePackDocs.includes(requiredText)) {
    console.error(`OpenCode native workflow pack docs are missing required text: ${requiredText}`);
    process.exit(1);
  }
}
const nativePackBuilder = readFileSync("core/opencode/NativeSubAgentWorkflowPackBuilder.ts", "utf8");
for (const requiredText of ["DISPATCH.md", "manifest.json", "output.schema.json", "openCodeAgentName", "workflow:native-collect"]) {
  if (!nativePackBuilder.includes(requiredText)) {
    console.error(`NativeSubAgentWorkflowPackBuilder is missing required text: ${requiredText}`);
    process.exit(1);
  }
}

console.log(`OpenCode adapter files OK: ${requiredFiles.length}`);
console.warn("Warning: agentflow_run_profile_workflow is provided by the AgentFlow MCP server; restart OpenCode and confirm the agentflow MCP tools are available.");
