import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { AttemptStore } from "../core/adaptive/AttemptStore.ts";

describe("AttemptStore", () => {
  it("writes attempts and decisions without secrets", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentflow-attempt-store-"));
    const store = new AttemptStore(dir);
    const attempt = {
      attemptId: "attempt-001",
      attemptNumber: 1,
      routeId: "direct_deliverable",
      actionSummary: "token=secret-value",
      inputArtifacts: [],
      outputArtifacts: ["answer"],
      resultSummary: "apiKey=secret-value",
      createdAt: new Date().toISOString(),
    };
    const decision = {
      decision: "success" as const,
      reason: "Bearer secret-token",
      blockedReasons: [],
      shouldUpdateMemory: true,
      createdAt: new Date().toISOString(),
    };

    const paths = await store.saveAttemptWithDecision(attempt, decision);

    assert.match(paths.attemptPath, /attempt-001\.json$/);
    assert.match(paths.decisionsPath, /decisions\.jsonl$/);
    const attemptText = await readFile(paths.attemptPath, "utf8");
    const decisionText = await readFile(paths.decisionsPath, "utf8");
    assert.doesNotMatch(attemptText, /secret-value/);
    assert.doesNotMatch(decisionText, /secret-token/);
    assert.match(attemptText, /\[REDACTED\]/);
    assert.match(decisionText, /\[REDACTED\]/);
  });
});
