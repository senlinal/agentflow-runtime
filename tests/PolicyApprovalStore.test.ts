import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { PolicyApprovalStore } from "../adapters/opencode/PolicyApprovalStore.ts";
import type { PolicyAuditRecord } from "../adapters/opencode/PolicyAuditLogger.ts";
import { ToolCallHasher } from "../adapters/opencode/ToolCallHasher.ts";

describe("PolicyApprovalStore", () => {
  it("creates pending approval files and lists them", async () => {
    const store = await makeStore();
    store.createPending(record("policy_pending"));

    const pending = store.listPending();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].decisionId, "policy_pending");
  });

  it("approves pending records", async () => {
    const store = await makeStore();
    store.createPending(record("policy_approve"));

    const approved = store.approve("policy_approve", "ok");

    assert.equal(approved.status, "approved");
    assert.equal(store.listPending().length, 0);
    assert.equal(store.getApproval("policy_approve").status, "approved");
  });

  it("rejects pending records", async () => {
    const store = await makeStore();
    store.createPending(record("policy_reject"));

    const rejected = store.reject("policy_reject", "no");

    assert.equal(rejected.status, "rejected");
    assert.equal(store.listPending().length, 0);
  });

  it("fails when approving a missing decision", async () => {
    const store = await makeStore();
    assert.throws(() => store.approve("missing"), /Pending approval not found/);
  });

  it("handles repeated approve stably", async () => {
    const store = await makeStore();
    store.createPending(record("policy_repeat"));
    const first = store.approve("policy_repeat", "ok");
    const second = store.approve("policy_repeat", "ok again");

    assert.equal(first.status, "approved");
    assert.equal(second.status, "approved");
  });

  it("writes approvals.jsonl", async () => {
    const store = await makeStore();
    store.createPending(record("policy_jsonl"));
    store.approve("policy_jsonl", "ok");

    const raw = await readFile(store.path("approvals.jsonl"), "utf8");
    const lines = raw.trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(lines.length, 1);
    assert.equal(lines[0].status, "approved");
  });
});

async function makeStore(): Promise<PolicyApprovalStore> {
  return new PolicyApprovalStore(await mkdtemp(join(tmpdir(), "policy-approval-")));
}

function record(decisionId: string): PolicyAuditRecord {
  const hashed = ToolCallHasher.hash({
    toolName: "bash",
    toolArgs: { command: "rm core/example.ts" },
    command: "rm core/example.ts",
    affectedPaths: ["core/example.ts"],
    projectRoot: "/project",
  });
  return {
    decisionId,
    timestamp: new Date().toISOString(),
    action: "ask",
    riskLevel: "high",
    reason: "Needs approval.",
    matchedRule: "delete-existing-project-file",
    affectedPaths: ["core/example.ts"],
    toolName: "bash",
    toolArgs: { command: "rm core/example.ts" },
    command: "rm core/example.ts",
    toolCallHash: hashed.hash,
    normalizedArgs: hashed.normalized.normalizedArgs,
    projectRoot: "/project",
    workflowRunId: null,
    sessionId: null,
    source: "test",
  };
}
