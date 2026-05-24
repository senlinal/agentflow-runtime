import { access } from "node:fs/promises";
import { readFileSync } from "node:fs";

const requiredFiles = [
  ".opencode/commands/workflow.md",
  ".opencode/commands/workflow-cli.md",
  ".opencode/commands/workflow-profile.md",
  ".opencode/tools/run-workflow.ts",
  ".opencode/tools/run-profile-workflow.ts",
  ".opencode/tools/run_profile_workflow.ts",
  ".opencode/plugins/agentflow-policy.ts",
  ".opencode/plugins/agentflow-workflow-interceptor.ts",
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

const workflowCommand = readFileSync(".opencode/commands/workflow.md", "utf8");
const workflowCommandLines = workflowCommand.trimEnd().split("\n");
if (workflowCommandLines.length > 10) {
  console.error(`workflow.md is too long for a quiet slash command: ${workflowCommandLines.length} lines`);
  process.exit(1);
}
for (const requiredText of [
  "AgentFlow plugin interceptor",
  "npm run workflow:run-profile -- --task",
  "Do not print this file",
]) {
  if (!workflowCommand.includes(requiredText)) {
    console.error(`workflow.md does not include plugin interceptor fallback text: ${requiredText}`);
    process.exit(1);
  }
}

for (const forbiddenText of ["todowrite", "list_files", "Research Plan", "Command Instructions", "auto-slash-command", "search-mode", "AGENTFLOW_PROJECT_ROOT", "opencode-workflow-command.ts", "!`", "agentflow_run_profile_workflow", "run_profile_workflow"]) {
  if (workflowCommand.includes(forbiddenText)) {
    console.error(`workflow.md appears to expose or require forbidden behavior: ${forbiddenText}`);
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

const mcpServer = readFileSync("mcp/agentflow-mcp-server.ts", "utf8");
for (const requiredText of [
  "tools/list",
  "tools/call",
  "agentflow_run_profile_workflow",
  "agentflow_list_profiles",
  "agentflow_inspect_profile",
  "agentflow_show_last_run",
  "structuredContent",
]) {
  if (!mcpServer.includes(requiredText)) {
    console.error(`AgentFlow MCP server is missing expected text: ${requiredText}`);
    process.exit(1);
  }
}

const policyPlugin = readFileSync(".opencode/plugins/agentflow-policy.ts", "utf8");
for (const requiredText of ["export async function AgentFlowPolicy", "export default AgentFlowPolicy", "tool.execute.before"]) {
  if (!policyPlugin.includes(requiredText)) {
    console.error(`agentflow policy plugin is missing OpenCode function export text: ${requiredText}`);
    process.exit(1);
  }
}

const workflowInterceptor = readFileSync(".opencode/plugins/agentflow-workflow-interceptor.ts", "utf8");
for (const requiredText of [
  "export async function AgentFlowWorkflowInterceptor",
  "export default AgentFlowWorkflowInterceptor",
  "command.execute.before",
  "agentflow_run_profile_workflow",
  "parseWorkflowCommand",
  "AgentFlow Runtime was not started.",
]) {
  if (!workflowInterceptor.includes(requiredText)) {
    console.error(`agentflow workflow interceptor is missing expected text: ${requiredText}`);
    process.exit(1);
  }
}
for (const forbiddenText of ["todowrite", "list_files", "Research Plan", "search-mode"]) {
  if (workflowInterceptor.includes(forbiddenText)) {
    console.error(`agentflow workflow interceptor includes forbidden supervisor behavior: ${forbiddenText}`);
    process.exit(1);
  }
}

console.log(`OpenCode adapter files OK: ${requiredFiles.length}`);
console.warn("Warning: agentflow_run_profile_workflow is provided by the AgentFlow MCP server; restart OpenCode and confirm the agentflow MCP tools are available.");
