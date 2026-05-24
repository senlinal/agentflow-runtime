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
  "docs/LLM_ADAPTER.md",
  "docs/AGENT_POLICY.md",
  "AGENTS.md",
  "opencode.json",
  "profiles/current.json",
  "profiles/rag-optimization.json",
  "profiles/coding-safe-fix.json",
  "profiles/external-project-fix.json",
  "profiles/frontend-site-build.json",
  "core/profile/ProfileRouter.ts",
  "core/profile/ProfileRunFormatter.ts",
  "core/profile/ProjectMemoryStore.ts",
  "core/profile/MemoryAutonomyGate.ts",
  "core/profile/EscalationGate.ts",
  "cli/project-memory-list.ts",
  "cli/project-memory-summary.ts",
  "cli/project-memory-compact.ts",
  "cli/project-memory-autonomy.ts",
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
for (const requiredText of ["run_profile_workflow", "AgentFlow Role Timeline", "unavailable planning helper tools", "unavailable file-listing helper tools"]) {
  if (!workflowCommand.includes(requiredText)) {
    console.error(`workflow.md does not include quiet workflow entrypoint text: ${requiredText}`);
    process.exit(1);
  }
}
for (const requiredText of [
  "Do not print, summarize, or quote this command file",
  "formattedText",
  "npm run workflow:run-profile -- --task",
  "neither `run_profile_workflow` nor a shell tool is available",
]) {
  if (!workflowCommand.includes(requiredText)) {
    console.error(`workflow.md does not include quiet/fallback text: ${requiredText}`);
    process.exit(1);
  }
}

for (const forbiddenText of ["todowrite", "list_files", "bash as the only fallback"]) {
  if (workflowCommand.includes(forbiddenText)) {
    console.error(`workflow.md appears to expose or require forbidden behavior: ${forbiddenText}`);
    process.exit(1);
  }
}

const runProfileTool = readFileSync(".opencode/tools/run_profile_workflow.ts", "utf8");
for (const requiredText of ['import { tool } from "@opencode-ai/plugin"', "export default tool({", "runProfileWorkflow"]) {
  if (!runProfileTool.includes(requiredText)) {
    console.error(`run_profile_workflow tool is not registered with OpenCode tool(): ${requiredText}`);
    process.exit(1);
  }
}

console.log(`OpenCode adapter files OK: ${requiredFiles.length}`);
console.warn("Warning: run_profile_workflow tool file exists and uses OpenCode tool(), but runtime availability must be confirmed inside opencode.");
