import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { PolicyApprovalStore } from "../adapters/opencode/PolicyApprovalStore.ts";
import type { PolicyAuditRecord } from "../adapters/opencode/PolicyAuditLogger.ts";
import { PolicyReplayRunner } from "../adapters/opencode/PolicyReplayRunner.ts";
import { ToolCallHasher } from "../adapters/opencode/ToolCallHasher.ts";

describe("PolicyReplayRunner", () => {
  it("dry-run does not execute command", async () => {
    const fx = await fixture("policy_dry", "rm existing.txt");
    const result = await fx.runner.run("policy_dry");

    assert.equal(result.status, "planned");
    assert.equal(existsSync(join(fx.projectRoot, "existing.txt")), true);
  });

  it("executes approved bash command and consumes approval", async () => {
    const fx = await fixture("policy_exec", "rm existing.txt");
    const result = await fx.runner.run("policy_exec", { execute: true });

    assert.equal(result.status, "executed");
    assert.equal(result.exitCode, 0);
    assert.equal(existsSync(join(fx.projectRoot, "existing.txt")), false);
    assert.equal(fx.store.getApproval("policy_exec").status, "consumed");
  });

  it("blocks consumed approval on second execute", async () => {
    const fx = await fixture("policy_once", "rm existing.txt");
    await fx.runner.run("policy_once", { execute: true });
    const second = await fx.runner.run("policy_once", { execute: true });

    assert.equal(second.status, "blocked");
  });

  it("blocks rejected approval", async () => {
    const fx = await fixture("policy_rejected", "rm existing.txt", false);
    fx.store.reject("policy_rejected");
    const result = await fx.runner.run("policy_rejected", { execute: true });

    assert.equal(result.status, "blocked");
  });

  it("blocks expired approval", async () => {
    const fx = await fixture("policy_expired", "rm existing.txt");
    const approval = fx.store.getApproval("policy_expired");
    approval.expiresAt = new Date(Date.now() - 1000).toISOString();
    await writeFile(fx.store.pendingPath("policy_expired"), `${JSON.stringify(approval, null, 2)}\n`, "utf8");

    const result = await fx.runner.run("policy_expired", { execute: true });

    assert.equal(result.status, "blocked");
  });

  it("returns unsupported for non-bash tools", async () => {
    const fx = await fixture("policy_write", "write something", false, "write");
    fx.store.approve("policy_write");

    const result = await fx.runner.run("policy_write", { execute: true });

    assert.equal(result.status, "unsupported");
  });

  it("records failed executions", async () => {
    const fx = await fixture("policy_fail", "rm missing.txt");
    const result = await fx.runner.run("policy_fail", { execute: true });

    assert.equal(result.status, "failed");
    const raw = await readFile(result.replayLogPath, "utf8");
    assert.match(raw, /policy_fail/);
  });

  it("redacts sensitive stdout and truncates previews", async () => {
    const fx = await fixture("policy_secret", "printf 'token=secret '; yes x | head -c 3000");
    const result = await fx.runner.run("policy_secret", { execute: true });

    assert.doesNotMatch(result.stdoutPreview, /secret/);
    assert.match(result.stdoutPreview, /REDACTED|truncated/);
  });
});

async function fixture(
  decisionId: string,
  command: string,
  approve = true,
  toolName = "bash",
): Promise<{ store: PolicyApprovalStore; runner: PolicyReplayRunner; projectRoot: string }> {
  const projectRoot = await mkdtemp(join(tmpdir(), "policy-replay-project-"));
  await writeFile(join(projectRoot, "existing.txt"), "x", "utf8");
  const store = new PolicyApprovalStore(await mkdtemp(join(tmpdir(), "policy-replay-log-")));
  store.createPending(record(decisionId, command, projectRoot, toolName));
  if (approve) store.approve(decisionId);
  return { store, runner: new PolicyReplayRunner(store), projectRoot };
}

function record(decisionId: string, command: string, projectRoot: string, toolName: string): PolicyAuditRecord {
  const hashed = ToolCallHasher.hash({
    toolName,
    toolArgs: { command },
    command,
    affectedPaths: ["existing.txt"],
    projectRoot,
  });
  return {
    decisionId,
    timestamp: new Date().toISOString(),
    action: "ask",
    riskLevel: "high",
    reason: "Needs approval.",
    matchedRule: "delete-existing-project-file",
    affectedPaths: ["existing.txt"],
    toolName,
    toolArgs: { command },
    command,
    toolCallHash: hashed.hash,
    normalizedArgs: hashed.normalized.normalizedArgs,
    projectRoot,
    workflowRunId: null,
    sessionId: null,
    source: "test",
  };
}
