import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProfileWorkflowRunner } from "../core/profile/ProfileWorkflowRunner.ts";
import { ProfileSessionStore } from "../core/profile/ProfileSessionStore.ts";
import { ProjectMemoryStore } from "../core/profile/ProjectMemoryStore.ts";
import { ScopeConfirmationStore } from "../core/scope/ScopeConfirmationStore.ts";

test("ProfileWorkflowRunner", async (t) => {
  await t.test("runs active rag profile safe preflight and blocks at missing scope confirmation", async () => {
    const result = await createRunner().run({
      task: "继续 RAG 召回优化，分析上一轮实验结果，给出下一步方案",
    });

    assert.equal(result.profileId, "rag-optimization");
    assert.equal(result.finalStatus, "blocked");
    assert.equal(result.steps[0].workflow, "task-negotiation");
    assert.equal(result.steps[0].status, "ran");
    assert.equal(result.steps[0].enteredExecutor, false);
    assert.equal(result.steps[1].workflow, "confirmed-scope-gate");
    assert.equal(result.steps[1].status, "blocked");
    assert.match(result.steps[1].reason, /ScopeConfirmationRecord/);
    assert.equal(result.steps[2].status, "skipped");
    assert.equal(result.session?.status, "pending_scope_confirmation");
    assert.ok(result.session?.sessionId);
  });

  await t.test("dry-run only plans profile workflow chain", async () => {
    const result = await createRunner().run({
      profileId: "rag-optimization",
      task: "检查 RAG 召回指标口径",
      dryRun: true,
    });

    assert.equal(result.finalStatus, "planned");
    assert.deepEqual(result.steps.map((step) => step.status), ["planned", "planned", "planned"]);
    assert.equal(result.steps.some((step) => step.runId), false);
  });

  await t.test("blocks execution-capable coding profile by default", async () => {
    const result = await createRunner().run({
      profileId: "coding-safe-fix",
      task: "修复一个小 bug",
    });

    assert.equal(result.finalStatus, "blocked");
    assert.equal(result.steps[0].workflow, "code-test-verify");
    assert.equal(result.steps[0].status, "blocked");
    assert.match(result.steps[0].reason, /allowExecution=false/);
  });

  await t.test("uses profile default input when task is omitted", async () => {
    const result = await createRunner().run({
      profileId: "rag-optimization",
      dryRun: true,
    });

    assert.equal(result.taskBrief.taskId.length > 0, true);
    assert.equal(result.finalStatus, "planned");
  });

  await t.test("resumes pending scope session from user answer", async () => {
    const runner = createRunner();
    const first = await runner.run({
      profileId: "rag-optimization",
      task: "继续 RAG 召回优化，分析上一轮实验结果，给出下一步方案",
    });
    assert.equal(first.finalStatus, "blocked");
    assert.equal(first.session?.status, "pending_scope_confirmation");

    const resumed = await runner.run({
      profileId: "rag-optimization",
      sessionId: first.session?.sessionId,
      answer: "召回口径按 heading/file，不牺牲回答质量，不改生产索引，可以做 query rewrite 和 reranker 实验。",
    });

    assert.equal(resumed.session?.status, "completed");
    assert.ok(resumed.scopeConfirmationId);
    assert.equal(resumed.steps[1].workflow, "confirmed-scope-gate");
    assert.equal(resumed.steps[1].status, "ran");
    assert.equal(resumed.steps[2].workflow, "research-feasibility-execute-verify");
    assert.equal(resumed.steps[2].status, "ran");
    assert.equal(resumed.steps.some((step) => step.enteredExecutor === true), true);
    assert.ok(resumed.memorySummary);
    assert.equal(resumed.memorySummary.activeConfirmedScopes.length > 0, true);
    assert.equal(resumed.memorySummary.triedRoutes.length > 0, true);
    assert.equal(resumed.nextActions.some((action) => /confirmed scope/i.test(action)), true);
  });

  await t.test("reads recent project memory on later profile runs", async () => {
    const runner = createRunner();
    const first = await runner.run({
      profileId: "rag-optimization",
      task: "继续 RAG 召回优化，分析上一轮实验结果，给出下一步方案",
    });
    await runner.run({
      profileId: "rag-optimization",
      sessionId: first.session?.sessionId,
      answer: "召回口径按 heading/file，不牺牲回答质量，不改生产索引，可以做 query rewrite 和 reranker 实验。",
    });

    const later = await runner.run({
      profileId: "rag-optimization",
      task: "继续基于上一轮确认范围给出下一步方案",
      dryRun: true,
    });

    assert.ok(later.memorySummary);
    assert.equal(later.memorySummary.records.length > 0, true);
    assert.equal(later.warnings.some((warning) => /Loaded .* project memory record/.test(warning)), true);
    assert.equal(later.taskBrief.resources.some((resource) => resource.startsWith("ProjectMemory(")), true);
  });

  await t.test("reads compacted project memory on later profile runs", async () => {
    const runner = createRunner();
    const first = await runner.run({
      profileId: "rag-optimization",
      task: "继续 RAG 召回优化，分析上一轮实验结果，给出下一步方案",
    });
    await runner.run({
      profileId: "rag-optimization",
      sessionId: first.session?.sessionId,
      answer: "召回口径按 heading/file，不牺牲回答质量，不改生产索引，可以做 query rewrite 和 reranker 实验。",
    });
    await runner.compactMemory("rag-optimization");

    const later = await runner.run({
      profileId: "rag-optimization",
      task: "继续基于压缩记忆给出下一步方案",
      dryRun: true,
    });

    assert.equal(later.warnings.some((warning) => /Loaded compacted project memory/.test(warning)), true);
    assert.equal(later.taskBrief.resources.some((resource) => resource.startsWith("CompactMemory(")), true);
  });
});

function createRunner(): ProfileWorkflowRunner {
  const root = join(tmpdir(), `agentflow-profile-runner-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return new ProfileWorkflowRunner(
    undefined,
    undefined,
    undefined,
    new ProfileSessionStore(join(root, "sessions")),
    new ScopeConfirmationStore(join(root, "scopes")),
    new ProjectMemoryStore(join(root, "memory")),
  );
}
