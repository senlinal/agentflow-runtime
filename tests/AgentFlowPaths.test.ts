import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(".");

test("AgentFlow runtime paths work outside the runtime repository cwd", async () => {
  const outside = await mkdtemp(join(tmpdir(), "agentflow-outside-cwd-"));
  const { stdout } = await execFileAsync(
    "node",
    [
      "--experimental-strip-types",
      join(repoRoot, "cli", "workflow-profile-inspect.ts"),
      "--profile",
      "agent-workforce-basic",
      "--format",
      "json",
    ],
    {
      cwd: outside,
      env: {
        ...process.env,
        AGENTFLOW_PROJECT_ROOT: repoRoot,
      },
      maxBuffer: 1024 * 1024,
    },
  );

  const parsed = JSON.parse(stdout) as { profile: { id: string }; sourcePath: string; workflowChain: string[] };
  assert.equal(parsed.profile.id, "agent-workforce-basic");
  assert.deepEqual(parsed.workflowChain, ["abcde-basic"]);
  assert.equal(parsed.sourcePath, "profiles/agent-workforce-basic.json");
});
