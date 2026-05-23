import { existsSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { spawnSync } from "node:child_process";

const requiredFiles = [
  "README.md",
  "QUICKSTART.md",
  "ARCHITECTURE.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CHANGELOG.md",
  "LICENSE",
  ".env.example",
  ".gitignore",
  "package.json",
  "docs/AGENT_POLICY.md",
  "docs/LLM_ADAPTER.md",
  "docs/OPENCODE_ADAPTER.md",
  "AGENTS.md",
  "core/execution/ExecutionRecordStore.ts",
  "core/execution/ExecutionRecordFormatter.ts",
  "core/external/ExternalProjectImporter.ts",
  "core/external/ExternalProjectWorkspaceRunner.ts",
  "cli/execution-list.ts",
  "cli/execution-show.ts",
  "cli/execution-rollback-guide.ts",
  "cli/external-project-run.ts",
  "demo-e2e-real-project.ts",
  "demo-external-project-import.ts",
  "docs/REAL_PROJECT_E2E.md",
  "docs/EXTERNAL_PROJECT_IMPORT.md",
  "inputs/e2e-real-project-fix-task.json",
  "tests/fixtures/e2e-real-project/package.json",
  "tests/fixtures/e2e-real-project/src/calculator.ts",
  "tests/fixtures/e2e-real-project/src/string-utils.ts",
  "tests/fixtures/e2e-real-project/tests/calculator.test.js",
  "tests/fixtures/e2e-real-project/tests/string-utils.test.js",
  "workflows/research-feasibility-execute-verify.json",
  "workflows/abcde-basic.json",
  "workflows/abcde-basic.llm.json",
];

const requiredGitignoreEntries = [
  ".env",
  ".env.local",
  ".env.*.local",
  "node_modules/",
  "dist/",
  ".workflow-runs/",
  ".agentflow/executions/",
  ".agentflow/external-runs/",
  ".opencode/policy-runs/",
  ".opencode/node_modules/",
  ".opencode/opencode.db",
  "ai-daily/runtime/",
  "coverage/",
];

const forbiddenCandidatePrefixes = [
  ".env",
  ".env.local",
  "node_modules/",
  "dist/",
  "coverage/",
  ".workflow-runs/",
  ".agentflow/executions/",
  ".agentflow/external-runs/",
  ".opencode/policy-runs/",
  ".opencode/node_modules/",
  ".opencode/opencode.db",
  ".runtime/",
  ".venv/",
  "__pycache__/",
  "ai-daily/runtime/",
];

const textExtensions = new Set([
  "",
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".sh",
  ".ts",
  ".txt",
  ".yaml",
  ".yml",
]);

const failures: string[] = [];
const warnings: string[] = [];

for (const file of requiredFiles) {
  if (!existsSync(file)) failures.push(`Missing required release file: ${file}`);
}

const gitignore = existsSync(".gitignore") ? readFileSync(".gitignore", "utf8") : "";
for (const entry of requiredGitignoreEntries) {
  if (!gitignore.includes(entry)) failures.push(`.gitignore missing required entry: ${entry}`);
}

const candidates = listCandidateFiles();
for (const file of candidates) {
  if (isForbiddenCandidate(file)) {
    failures.push(`Ignored runtime/local artifact is still a release candidate: ${file}`);
  }
}

for (const file of candidates) {
  if (!isTextFile(file)) continue;
  const content = readFileSync(file, "utf8");
  if (content.includes(localHomePattern()) || content.includes(localWorkspacePattern())) {
    failures.push(`Local absolute path found in release candidate: ${file}`);
  }
  for (const token of content.match(/sk-[A-Za-z0-9_-]{8,}/g) ?? []) {
    if (!isClearlyFakeSecret(token)) {
      failures.push(`Possible real API key token found in ${file}: ${token.slice(0, 8)}...`);
    }
  }
  const secretAssignments = content.matchAll(/\b(?:api[_-]?key|token|secret|password)\s*=\s*["']?([A-Za-z0-9_\-]{12,})/gi);
  for (const match of secretAssignments) {
    const value = match[1] ?? "";
    if (!isClearlyFakeSecret(value)) {
      failures.push(`Possible hardcoded secret assignment found in ${file}`);
      break;
    }
  }
}

if (candidates.length === 0) {
  warnings.push("No git candidate files found. Is this repository initialized correctly?");
}

for (const warning of warnings) {
  console.warn(`Warning: ${warning}`);
}

if (failures.length > 0) {
  console.error("Release readiness check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Release readiness check passed. Candidate files scanned: ${candidates.length}`);
}

function listCandidateFiles(): string[] {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr}`);
  }
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

function isTextFile(file: string): boolean {
  if (!existsSync(file)) return false;
  const stat = statSync(file);
  if (!stat.isFile() || stat.size > 1_000_000) return false;
  return textExtensions.has(extname(file));
}

function isForbiddenCandidate(file: string): boolean {
  for (const prefix of forbiddenCandidatePrefixes) {
    if (prefix === ".env" && file !== ".env") continue;
    if (file === prefix || file.startsWith(prefix)) return true;
  }
  return false;
}

function isClearlyFakeSecret(token: string): boolean {
  const normalized = token.toLowerCase();
  return (
    normalized.includes("test") ||
    normalized.includes("fake") ||
    normalized.includes("secret") ||
    normalized.includes("replace") ||
    normalized.includes("trace") ||
    normalized.includes("your")
  );
}

function localHomePattern(): string {
  return `/${["Users", "liuyanqi"].join("/")}`;
}

function localWorkspacePattern(): string {
  return `/${["Documents", "探索技术"].join("/")}`;
}
