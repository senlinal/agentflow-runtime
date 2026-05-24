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
  "mcp/agentflow-server.ts",
  "profiles/current.json",
  "profiles/rag-optimization.json",
  "profiles/coding-safe-fix.json",
  "profiles/external-project-fix.json",
  "profiles/frontend-site-build.json",
  "profiles/agent-workforce-basic.json",
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
if (workflowCommandLines.length > 6) {
  console.error(`workflow.md is too long for a quiet slash command: ${workflowCommandLines.length} lines`);
  process.exit(1);
}
if (workflowCommand.includes("```json")) {
  console.error("workflow.md must not include JSON examples; keep slash command text minimal");
  process.exit(1);
}

for (const requiredText of ["!`node --experimental-strip-types cli/opencode-workflow-command.ts $ARGUMENTS`"]) {
  if (!workflowCommand.includes(requiredText)) {
    console.error(`workflow.md does not include quiet workflow entrypoint text: ${requiredText}`);
    process.exit(1);
  }
}

for (const forbiddenText of ["todowrite", "list_files", "Supervisor", "Research Plan", "run_profile_workflow"]) {
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
  '"mcp"',
  '"agentflow"',
  '"mcp/agentflow-server.ts"',
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

const mcpServer = readFileSync("mcp/agentflow-server.ts", "utf8");
for (const requiredText of ["tools/list", "tools/call", "run_profile_workflow", "structuredContent"]) {
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

console.log(`OpenCode adapter files OK: ${requiredFiles.length}`);
console.warn("Warning: run_profile_workflow is provided by the AgentFlow MCP server; restart OpenCode and confirm the agentflow MCP tool is available.");
