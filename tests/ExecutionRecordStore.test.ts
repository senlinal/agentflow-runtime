import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ExecutionRecordStore } from "../core/execution/ExecutionRecordStore.ts";
import { formatExecutionList, formatExecutionRecord, formatRollbackGuide } from "../core/execution/ExecutionRecordFormatter.ts";
import type { CodeChangePlanExecutionRecord } from "../core/types.ts";

describe("ExecutionRecordStore", () => {
  it("saves execution records, summaries, and rollback guides", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "agentflow-execution-store-"));
    const store = new ExecutionRecordStore(baseDir);
    const saved = await store.save(recordFixture());

    assert.match(saved.executionRecordPath, /records\/exec_1\.json$/);
    assert.match(saved.rollbackGuidePath ?? "", /rollback-guides\/rollback_exec_1\.json$/);
    assert.equal(saved.record.executionRecordPath, saved.executionRecordPath);
    assert.equal(saved.record.rollbackGuidePath, saved.rollbackGuidePath);
    assert.equal(saved.record.rollbackGuideId, "rollback_exec_1");

    const recordText = await readFile(saved.executionRecordPath, "utf8");
    const rollbackText = await readFile(saved.rollbackGuidePath!, "utf8");
    assert.doesNotMatch(recordText, /super-secret-token/);
    assert.doesNotMatch(rollbackText, /super-secret-token/);
    assert.match(recordText, /\[REDACTED\]/);
  });

  it("lists and filters records", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "agentflow-execution-store-"));
    const store = new ExecutionRecordStore(baseDir);
    await store.save(recordFixture({ executionId: "exec_passed", status: "executed", approvalId: "approval_1" }));
    await store.save(recordFixture({ executionId: "exec_failed", status: "failed", approvalId: "approval_2", verificationPass: false }));
    await store.save(recordFixture({ executionId: "exec_blocked", status: "blocked", approvalId: "approval_3", verificationPass: undefined }));

    assert.equal((await store.list()).length, 3);
    assert.deepEqual((await store.list({ status: "failed" })).map((record) => record.executionId), ["exec_failed"]);
    assert.deepEqual((await store.list({ approvalId: "approval_3" })).map((record) => record.executionId), ["exec_blocked"]);
    assert.deepEqual((await store.list({ verificationPass: true })).map((record) => record.executionId), ["exec_passed"]);
    assert.deepEqual((await store.list({ limit: 1 })).length, 1);
  });

  it("gets records and rollback guides by executionId", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "agentflow-execution-store-"));
    const store = new ExecutionRecordStore(baseDir);
    await store.save(recordFixture());

    const record = await store.get("exec_1");
    const guide = await store.getRollbackGuide("exec_1");
    assert.equal(record.executionId, "exec_1");
    assert.equal(guide.rollbackId, "rollback_exec_1");
    assert.equal(guide.destructiveRollbackAvailable, false);
    await assert.rejects(() => store.get("missing"), /Execution record not found/);
  });

  it("formats execution records and rollback guides", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "agentflow-execution-store-"));
    const store = new ExecutionRecordStore(baseDir);
    const saved = await store.save(recordFixture());
    const listText = formatExecutionList(await store.list());
    const showText = formatExecutionRecord(saved.record);
    const guideText = formatRollbackGuide(await store.getRollbackGuide("exec_1"));
    const jsonText = formatExecutionRecord(saved.record, "json");

    assert.match(listText, /exec_1/);
    assert.match(showText, /verificationPass: true/);
    assert.match(guideText, /destructiveRollbackAvailable: false/);
    assert.equal(JSON.parse(jsonText).executionId, "exec_1");
  });
});

function recordFixture(overrides: Partial<CodeChangePlanExecutionRecord> & { verificationPass?: boolean } = {}): CodeChangePlanExecutionRecord {
  const verificationPass = "verificationPass" in overrides ? overrides.verificationPass : true;
  return {
    executionId: overrides.executionId ?? "exec_1",
    codeChangePlanId: overrides.codeChangePlanId ?? "plan_1",
    approvalId: overrides.approvalId ?? "approval_1",
    codeChangePlanHash: "sha256:abc",
    hashMatched: true,
    status: overrides.status ?? "executed",
    startedAt: overrides.startedAt ?? "2026-05-23T00:00:00.000Z",
    finishedAt: overrides.finishedAt ?? "2026-05-23T00:00:01.000Z",
    checkpointId: "checkpoint_1",
    consumedApproval: true,
    codeExecutionResult: {
      status: "success",
      completedSteps: ["wrote file"],
      artifacts: ["src/generated.txt"],
      summary: "Code execution success.",
      errors: [],
      rawOutput: JSON.stringify({ token: "super-secret-token", checkpoint: { cwd: "/tmp/workspace" } }),
    },
    testExecutionResult: {
      status: "passed",
      completedSteps: ["npm run test"],
      artifacts: [],
      summary: "Tests passed.",
      errors: [],
      rawOutput: "ok",
    },
    ...(verificationPass === undefined ? {} : { verification: {
      pass: verificationPass,
      score: verificationPass ? 1 : 0,
      failedCriteria: verificationPass ? [] : ["test failed"],
      reason: verificationPass ? "passed" : "failed",
      nextAction: verificationPass ? "end" : "replan",
      feedbackToPlanner: "n/a",
    } }),
    rollbackGuide: {
      checkpointId: "checkpoint_1",
      workspaceRoot: "/tmp/workspace",
      summary: "Manual rollback only.",
      changedFiles: ["src/generated.txt"],
      suggestedCommands: [],
      manualSteps: ["Review changed file."],
      reason: "No destructive rollback.",
      destructiveRollbackAvailable: false,
      destructiveRollbackPerformed: false,
    },
    blockedReasons: overrides.blockedReasons ?? [],
    safetyFindings: overrides.safetyFindings ?? ["safe"],
  };
}
