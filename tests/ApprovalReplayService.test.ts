import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { ApprovalReplayService } from "../adapters/opencode/ApprovalReplayService.ts";
import { PolicyApprovalStore } from "../adapters/opencode/PolicyApprovalStore.ts";
import type { PolicyAuditRecord } from "../adapters/opencode/PolicyAuditLogger.ts";
import { ToolCallHasher } from "../adapters/opencode/ToolCallHasher.ts";

describe("ApprovalReplayService", () => {
  it("marks approved approvals replayable", async () => {
    const { store, service } = await fixture();
    store.createPending(record("policy_ok"));
    store.approve("policy_ok");

    const plan = service.buildReplayPlan("policy_ok");

    assert.equal(plan.replayable, true);
    assert.equal(plan.command, "rm existing.txt");
    assert.ok(plan.toolCallHash);
  });

  it("marks pending approval not replayable", async () => {
    const { store, service } = await fixture();
    store.createPending(record("policy_pending"));
    assert.equal(service.buildReplayPlan("policy_pending").replayable, false);
  });

  it("marks rejected approval not replayable", async () => {
    const { store, service } = await fixture();
    store.createPending(record("policy_rejected"));
    store.reject("policy_rejected");
    assert.equal(service.buildReplayPlan("policy_rejected").replayable, false);
  });

  it("marks consumed approval not replayable", async () => {
    const { store, service } = await fixture();
    store.createPending(record("policy_consumed"));
    store.approve("policy_consumed");
    const approval = store.getApproval("policy_consumed");
    store.consumeForReplay("policy_consumed", {
      toolCallHash: approval.toolCallHash ?? "",
      normalizedToolCall: approval.normalizedToolCall!,
    });
    assert.equal(service.buildReplayPlan("policy_consumed").replayable, false);
  });

  it("marks expired approval not replayable", async () => {
    const { store, service } = await fixture();
    store.createPending(record("policy_expired"));
    store.approve("policy_expired");
    const plan = service.buildReplayPlan("policy_expired", new Date(Date.now() + 16 * 60 * 1000));
    assert.equal(plan.replayable, false);
    assert.match(plan.reason, /expired/i);
  });

  it("detects hash mismatch", async () => {
    const { store, service } = await fixture();
    const bad = record("policy_bad");
    bad.toolCallHash = "bad";
    store.createPending(bad);
    store.approve("policy_bad");

    const plan = service.buildReplayPlan("policy_bad");

    assert.equal(plan.replayable, false);
    assert.match(plan.reason, /hash/i);
  });
});

async function fixture(): Promise<{ store: PolicyApprovalStore; service: ApprovalReplayService }> {
  const store = new PolicyApprovalStore(await mkdtemp(join(tmpdir(), "approval-replay-")));
  return { store, service: new ApprovalReplayService(store) };
}

function record(decisionId: string): PolicyAuditRecord {
  const hashed = ToolCallHasher.hash({
    toolName: "bash",
    toolArgs: { command: "rm existing.txt" },
    command: "rm existing.txt",
    affectedPaths: ["existing.txt"],
    projectRoot: "/project",
  });
  return {
    decisionId,
    timestamp: new Date().toISOString(),
    action: "ask",
    riskLevel: "high",
    reason: "Needs approval.",
    matchedRule: "delete-existing-project-file",
    affectedPaths: ["existing.txt"],
    toolName: "bash",
    toolArgs: { command: "rm existing.txt" },
    command: "rm existing.txt",
    toolCallHash: hashed.hash,
    normalizedArgs: hashed.normalized.normalizedArgs,
    projectRoot: "/project",
    workflowRunId: null,
    sessionId: null,
    source: "test",
  };
}
