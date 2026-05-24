import test from "node:test";
import assert from "node:assert/strict";
import { ProfileRouter } from "../core/profile/ProfileRouter.ts";

test("ProfileRouter", async (t) => {
  const router = new ProfileRouter();

  await t.test("routes explanation tasks to task-solving", () => {
    const decision = router.route({
      currentProfile: "agent-workforce-basic",
      task: "解释一下咖啡的做法",
    });
    assert.equal(decision.detectedTaskType, "general_answer");
    assert.equal(decision.recommendedProfile, "task-solving");
    assert.equal(decision.shouldSwitch, true);
    assert.equal(decision.safeToAutoSwitch, true);
  });

  await t.test("routes RAG tasks to rag-optimization", () => {
    const decision = router.route({
      currentProfile: "frontend-site-build",
      task: "继续 RAG 召回优化，分析 reranker 和 chunk 实验结果",
    });
    assert.equal(decision.detectedTaskType, "rag_optimization");
    assert.equal(decision.recommendedProfile, "rag-optimization");
    assert.equal(decision.shouldSwitch, true);
    assert.equal(decision.safeToAutoSwitch, true);
  });

  await t.test("routes bug fix tasks to coding-safe-fix", () => {
    const decision = router.route({
      currentProfile: "rag-optimization",
      task: "修复一个导致测试失败的 bug",
    });
    assert.equal(decision.detectedTaskType, "coding_fix");
    assert.equal(decision.recommendedProfile, "coding-safe-fix");
    assert.equal(decision.shouldSwitch, true);
    assert.equal(decision.safeToAutoSwitch, false);
  });

  await t.test("routes external project tasks to external-project-fix", () => {
    const decision = router.route({
      currentProfile: "rag-optimization",
      task: "对一个外部项目路径运行修复并导出 patch",
    });
    assert.equal(decision.detectedTaskType, "external_project_fix");
    assert.equal(decision.recommendedProfile, "external-project-fix");
    assert.equal(decision.shouldSwitch, true);
    assert.equal(decision.safeToAutoSwitch, false);
  });

  await t.test("routes website tasks to frontend-site-build", () => {
    const decision = router.route({
      currentProfile: "rag-optimization",
      task: "做一个仿 Claude.ai 风格的个人网站",
    });
    assert.equal(decision.detectedTaskType, "frontend_site_build");
    assert.equal(decision.recommendedProfile, "frontend-site-build");
    assert.equal(decision.shouldSwitch, true);
    assert.equal(decision.safeToAutoSwitch, true);
  });

  await t.test("does not switch when the current profile already matches", () => {
    const decision = router.route({
      currentProfile: "frontend-site-build",
      task: "做一个 landing page",
    });
    assert.equal(decision.recommendedProfile, "frontend-site-build");
    assert.equal(decision.shouldSwitch, false);
  });

  await t.test("explicit profile disables auto-switch and adds a warning", () => {
    const decision = router.route({
      currentProfile: "rag-optimization",
      explicitProfile: "rag-optimization",
      task: "做一个仿 Claude.ai 风格的个人网站",
    });
    assert.equal(decision.recommendedProfile, "frontend-site-build");
    assert.equal(decision.shouldSwitch, false);
    assert.equal(decision.safeToAutoSwitch, false);
    assert.match(decision.warnings.join("\n"), /Explicit profile rag-optimization/);
  });
});
