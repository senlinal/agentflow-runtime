import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import { CheckpointManager } from "../core/execution/CheckpointManager.ts";
import { DiffCollector } from "../core/execution/DiffCollector.ts";
import { TestRunner } from "../core/execution/TestRunner.ts";

const execFileAsync = promisify(execFile);

describe("execution support modules", () => {
  it("creates a non-destructive checkpoint", async () => {
    const projectRoot = await createGitRepo();
    const checkpoint = await new CheckpointManager(projectRoot).createCheckpoint({ cwd: projectRoot });

    assert.ok(checkpoint.checkpointId.startsWith("checkpoint_"));
    assert.equal(checkpoint.cwd, projectRoot);
    assert.match(checkpoint.rollbackNote, /not performed/);
  });

  it("collects changed and untracked files", async () => {
    const projectRoot = await createGitRepo();
    await writeFile(join(projectRoot, "new-file.txt"), "hello\n", "utf8");
    const diff = await new DiffCollector(projectRoot).collect({ cwd: projectRoot });

    assert.equal(diff.hasChanges, true);
    assert.ok(diff.filesChanged.includes("new-file.txt"));
  });

  it("runs safe test commands through CommandRunner", async () => {
    const projectRoot = await createGitRepo();
    const result = await new TestRunner().run({
      projectRoot,
      cwd: projectRoot,
      commands: ["node -e \"console.log('test-ok')\""],
    });

    assert.equal(result.passed, true);
    assert.equal(result.commands[0].stdout.trim(), "test-ok");
  });

  it("reports failed test commands", async () => {
    const projectRoot = await createGitRepo();
    const result = await new TestRunner().run({
      projectRoot,
      cwd: projectRoot,
      commands: ["node -e \"process.exit(2)\""],
    });

    assert.equal(result.passed, false);
    assert.match(result.errors[0], /exited with 2/);
  });
});

async function createGitRepo(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "agentflow-exec-"));
  await execFileAsync("git", ["init"], { cwd: projectRoot });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: projectRoot });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: projectRoot });
  await writeFile(join(projectRoot, "README.md"), "# test\n", "utf8");
  await execFileAsync("git", ["add", "README.md"], { cwd: projectRoot });
  await execFileAsync("git", ["commit", "-m", "init"], { cwd: projectRoot });
  await readFile(join(projectRoot, "README.md"), "utf8");
  return projectRoot;
}
