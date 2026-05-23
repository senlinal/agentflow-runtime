import test from "node:test";
import assert from "node:assert/strict";
import { ProfileWorkflowRunner } from "../core/profile/ProfileWorkflowRunner.ts";

test("ProfileWorkflowRunner", async (t) => {
  await t.test("runs active rag profile safe preflight and blocks at missing scope confirmation", async () => {
    const result = await new ProfileWorkflowRunner().run({
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
  });

  await t.test("dry-run only plans profile workflow chain", async () => {
    const result = await new ProfileWorkflowRunner().run({
      profileId: "rag-optimization",
      task: "检查 RAG 召回指标口径",
      dryRun: true,
    });

    assert.equal(result.finalStatus, "planned");
    assert.deepEqual(result.steps.map((step) => step.status), ["planned", "planned", "planned"]);
    assert.equal(result.steps.some((step) => step.runId), false);
  });

  await t.test("blocks execution-capable coding profile by default", async () => {
    const result = await new ProfileWorkflowRunner().run({
      profileId: "coding-safe-fix",
      task: "修复一个小 bug",
    });

    assert.equal(result.finalStatus, "blocked");
    assert.equal(result.steps[0].workflow, "code-test-verify");
    assert.equal(result.steps[0].status, "blocked");
    assert.match(result.steps[0].reason, /allowExecution=false/);
  });

  await t.test("uses profile default input when task is omitted", async () => {
    const result = await new ProfileWorkflowRunner().run({
      profileId: "rag-optimization",
      dryRun: true,
    });

    assert.equal(result.taskBrief.taskId.length > 0, true);
    assert.equal(result.finalStatus, "planned");
  });
});
