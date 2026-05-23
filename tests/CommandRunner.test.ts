import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CommandRunner } from "../core/execution/CommandRunner.ts";

describe("CommandRunner", () => {
  it("runs allowed low-risk node commands without a shell", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "agentflow-command-"));
    const result = await new CommandRunner().run({
      command: "node -e \"console.log('ok')\"",
      projectRoot,
      cwd: projectRoot,
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout.trim(), "ok");
    assert.equal(result.timedOut, false);
  });

  it("rejects shell metacharacters", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "agentflow-command-"));
    await assert.rejects(
      () => new CommandRunner().run({ command: "node -v | sh", projectRoot, cwd: projectRoot }),
      /shell metacharacters/,
    );
  });

  it("rejects destructive executables by default", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "agentflow-command-"));
    await assert.rejects(
      () => new CommandRunner().run({ command: "rm -rf tmp", projectRoot, cwd: projectRoot }),
      /not allowed/,
    );
  });

  it("rejects cwd outside the project root", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "agentflow-command-"));
    await assert.rejects(
      () => new CommandRunner().run({ command: "node -v", projectRoot, cwd: tmpdir() }),
      /outside the project root/,
    );
  });
});
