import { access } from "node:fs/promises";
import { readFileSync } from "node:fs";

const requiredFiles = [
  ".opencode/commands/workflow.md",
  ".opencode/commands/workflow-profile.md",
  ".opencode/tools/run-workflow.ts",
  ".opencode/tools/run-profile-workflow.ts",
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
  "core/profile/ProjectMemoryStore.ts",
  "cli/project-memory-list.ts",
  "cli/project-memory-summary.ts",
  "cli/project-memory-compact.ts",
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
for (const requiredText of ["profiles/current.json", "WORKER_POLICY", "AUTONOMY_POLICY", "memory:summary"]) {
  if (!workflowCommand.includes(requiredText)) {
    console.error(`workflow.md does not reference ${requiredText}`);
    process.exit(1);
  }
}

console.log(`OpenCode adapter files OK: ${requiredFiles.length}`);
