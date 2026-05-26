import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProjectMemoryStore } from "../core/profile/ProjectMemoryStore.ts";
import { formatProjectMemories, formatProjectMemorySummary } from "../core/profile/ProjectMemoryFormatter.ts";
import type { ProjectMemoryRecord } from "../core/types.ts";

test("ProjectMemoryStore", async (t) => {
  await t.test("saves, lists, gets, and summarizes memory records", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentflow-memory-"));
    const store = new ProjectMemoryStore(dir);
    const scope = memory({
      memoryId: "memory_scope_1",
      type: "confirmed_scope",
      title: "Confirmed RAG scope",
      tags: ["scope", "rag"],
    });
    const route = memory({
      memoryId: "memory_route_1",
      type: "tried_route",
      title: "Tried route",
      tags: ["route"],
    });
    const next = memory({
      memoryId: "memory_next_1",
      type: "next_action",
      title: "Next action",
      tags: ["next-action"],
    });

    await store.save(scope);
    await store.save(route);
    await store.save(next);

    assert.equal((await store.get("memory_scope_1")).title, "Confirmed RAG scope");
    assert.equal((await store.list({ profileId: "rag-optimization" })).length, 3);
    assert.equal((await store.list({ type: "confirmed_scope" })).length, 1);
    assert.equal((await store.list({ tag: "route" })).length, 1);

    const summary = await store.summarize("rag-optimization");
    assert.equal(summary.activeConfirmedScopes.length, 1);
    assert.equal(summary.triedRoutes.length, 1);
    assert.equal(summary.nextActions.length, 1);
    assert.match(formatProjectMemorySummary(summary), /activeConfirmedScopes/);
    assert.match(formatProjectMemories([scope]), /memory_scope_1/);
  });

  await t.test("compacts memory into current facts, routes, next actions, and conflicts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentflow-memory-"));
    const store = new ProjectMemoryStore(dir);
    await store.save(memory({
      memoryId: "memory_scope_a",
      type: "confirmed_scope",
      title: "Confirmed RAG scope A",
      summary: "Goal: improve recall | Allowed modules: rag | Blocked actions: deploy | Quality constraints: no answer regression",
      tags: ["scope"],
    }));
    await store.save(memory({
      memoryId: "memory_scope_b",
      type: "confirmed_scope",
      title: "Confirmed RAG scope B",
      summary: "Goal: improve recall | Allowed modules: rag-v2 | Blocked actions: deploy | Quality constraints: no answer regression",
      tags: ["scope"],
    }));
    await store.save(memory({
      memoryId: "memory_blocked",
      type: "rejected_route",
      title: "Blocked workflow confirmed-scope-gate",
      summary: "Missing ScopeConfirmationRecord.",
      tags: ["blocked-route"],
    }));
    await store.save(memory({
      memoryId: "memory_open_question",
      type: "open_question",
      title: "Metric definition",
      summary: "Which recall level should be used?",
      tags: ["blocking"],
    }));

    const { summary, summaryPath } = await store.compact("rag-optimization");
    assert.ok(summaryPath.endsWith("rag-optimization.json"));
    assert.ok(summary.confirmedScope);
    assert.equal(summary.rejectedRoutes.length, 1);
    assert.equal(summary.openQuestions.length, 1);
    assert.equal(summary.conflicts.some((conflict) => conflict.type === "confirmed_scope_conflict"), true);
    assert.equal((await store.getCompacted("rag-optimization"))?.profileId, "rag-optimization");
  });

  await t.test("writes parseable JSONL and rejects secret-like memory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentflow-memory-"));
    const store = new ProjectMemoryStore(dir);
    await store.save(memory({ memoryId: "memory_clean" }));
    const jsonl = await readFile(join(dir, "records.jsonl"), "utf8");
    assert.doesNotThrow(() => JSON.parse(jsonl.trim()));

    await assert.rejects(
      () => store.save(memory({ memoryId: "memory_secret", summary: "token=fake-secret-value" })),
      /must not contain secret-like values/,
    );
  });

  await t.test("missing record fails clearly", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentflow-memory-"));
    await assert.rejects(
      () => new ProjectMemoryStore(dir).get("missing"),
      /Project memory record not found: missing/,
    );
  });

  await t.test("list skips stale record files without failing summaries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentflow-memory-"));
    const store = new ProjectMemoryStore(dir);
    await store.save(memory({ memoryId: "memory_valid" }));

    await mkdir(join(dir, "records"), { recursive: true });
    await writeFile(join(dir, "records", "memory_stale.json"), "{", "utf8");

    const records = await store.list({ profileId: "rag-optimization" });
    assert.deepEqual(records.map((record) => record.memoryId), ["memory_valid"]);
    const summary = await store.summarize("rag-optimization");
    assert.equal(summary.records.length, 1);
  });
});

function memory(overrides: Partial<ProjectMemoryRecord> = {}): ProjectMemoryRecord {
  return {
    memoryId: "memory_default",
    profileId: "rag-optimization",
    type: "decision",
    title: "Decision",
    summary: "Keep work inside the confirmed scope.",
    source: { sessionId: "session_1", confirmationId: "scope_1" },
    tags: ["decision"],
    status: "active",
    createdAt: "2026-05-23T00:00:00.000Z",
    ...overrides,
  };
}
