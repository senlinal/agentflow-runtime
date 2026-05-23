import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

checks.push({
  name: "node-version",
  ok: majorNodeVersion() >= 22,
  detail: `Node ${process.versions.node}; Node 22+ is required for --experimental-strip-types.`,
});

for (const file of [
  "README.md",
  "QUICKSTART.md",
  "ARCHITECTURE.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CHANGELOG.md",
  "LICENSE",
  ".env.example",
  "package.json",
  "docs/GITHUB_RELEASE_CHECKLIST.md",
]) {
  checks.push({
    name: `file:${file}`,
    ok: existsSync(file),
    detail: existsSync(file) ? "present" : "missing",
  });
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };
for (const script of ["demo", "workflow:list", "llm:smoke", "release:check", "repo:check", "doctor", "verify", "test", "typecheck"]) {
  checks.push({
    name: `script:${script}`,
    ok: Boolean(packageJson.scripts?.[script]),
    detail: packageJson.scripts?.[script] ?? "missing",
  });
}

for (const entry of [".env", ".workflow-runs", ".opencode/policy-runs", ".opencode/opencode.db"]) {
  const tracked = gitLsFiles(entry);
  checks.push({
    name: `git-untracked:${entry}`,
    ok: tracked.length === 0,
    detail: tracked.length === 0 ? "not tracked" : `tracked: ${tracked.join(", ")}`,
  });
}

for (const template of ["workflows/research-feasibility-execute-verify.json", "workflows/abcde-basic.json", "workflows/abcde-basic.llm.json"]) {
  checks.push({
    name: `template:${template}`,
    ok: existsSync(template),
    detail: existsSync(template) ? "present" : "missing",
  });
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.name} - ${check.detail}`);
}

if (failed.length > 0) {
  console.error(`Doctor failed: ${failed.length} issue(s).`);
  process.exitCode = 1;
} else {
  console.log("Doctor passed.");
}

function majorNodeVersion(): number {
  return Number(process.versions.node.split(".")[0] ?? "0");
}

function gitLsFiles(path: string): string[] {
  const result = spawnSync("git", ["ls-files", path], { encoding: "utf8" });
  if (result.status !== 0) {
    return [`git ls-files failed: ${result.stderr}`];
  }
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}
