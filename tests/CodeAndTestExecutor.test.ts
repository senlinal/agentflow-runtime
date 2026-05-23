import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import { createInitialContext } from "../core/context.ts";
import { CodeExecutor } from "../core/execution/CodeExecutor.ts";
import { TestExecutor } from "../core/execution/TestExecutor.ts";
import { NodeRegistry } from "../core/NodeRegistry.ts";
import type { AgentNode, WorkflowContext } from "../core/types.ts";

const execFileAsync = promisify(execFile);

describe("CodeExecutor and TestExecutor", () => {
  it("writes declared files, runs allowed commands, and returns ExecutionResult", async () => {
    const projectRoot = await createGitRepo();
    const node = executionNode("code_executor", "code", {
      fileWrites: [{ path: "generated/result.txt", content: "ok\n" }],
      commands: ["node -e \"console.log('code-ok')\""],
    });

    const result = await new CodeExecutor({ projectRoot }).execute(node, context());

    assert.equal(result.errors.length, 0);
    assert.ok(result.artifacts.includes("generated/result.txt"));
    assert.equal(await readFile(join(projectRoot, "generated/result.txt"), "utf8"), "ok\n");
    assert.match(result.summary, /Code executor completed/);
    assert.match(result.rawOutput, /code-ok/);
  });

  it("refuses sensitive file writes", async () => {
    const projectRoot = await createGitRepo();
    const node = executionNode("code_executor", "code", {
      fileWrites: [{ path: ".env", content: "SECRET=value\n" }],
    });

    const result = await new CodeExecutor({ projectRoot }).execute(node, context());

    assert.match(result.errors[0], /sensitive file/);
  });

  it("refuses project-external file writes", async () => {
    const projectRoot = await createGitRepo();
    const node = executionNode("code_executor", "code", {
      fileWrites: [{ path: join(tmpdir(), "outside-agentflow.txt"), content: "bad\n" }],
    });

    const result = await new CodeExecutor({ projectRoot }).execute(node, context());

    assert.match(result.errors[0], /outside the project root/);
  });

  it("runs test commands and returns ExecutionResult", async () => {
    const projectRoot = await createGitRepo();
    const node = executionNode("test_runner", "test", {
      projectRoot,
      cwd: projectRoot,
      commands: ["node -e \"console.log('tests-ok')\""],
    });

    const result = await new TestExecutor().execute(node, context());

    assert.equal(result.errors.length, 0);
    assert.match(result.summary, /passed/);
    assert.match(result.rawOutput, /tests-ok/);
  });

  it("registers code and test executors by default", () => {
    const registry = NodeRegistry.withDefaults();

    assert.ok(registry.getExecutor(executionNode("code_executor", "code")));
    assert.ok(registry.getExecutor(executionNode("test_runner", "test")));
  });
});

function executionNode(id: string, type: "code" | "test", executorConfig: Record<string, unknown> = {}): AgentNode {
  return {
    id,
    type,
    role: "Executor",
    description: id,
    inputKeys: [],
    outputKey: "executionResult",
    outputSchema: "ExecutionResult",
    executorConfig,
  };
}

function context(): WorkflowContext {
  return createInitialContext({
    taskId: "exec-test",
    userGoal: "test execution",
    successCriteria: ["execution result exists"],
  });
}

async function createGitRepo(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "agentflow-code-"));
  await execFileAsync("git", ["init"], { cwd: projectRoot });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: projectRoot });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: projectRoot });
  await writeFile(join(projectRoot, "README.md"), "# test\n", "utf8");
  await execFileAsync("git", ["add", "README.md"], { cwd: projectRoot });
  await execFileAsync("git", ["commit", "-m", "init"], { cwd: projectRoot });
  return projectRoot;
}
