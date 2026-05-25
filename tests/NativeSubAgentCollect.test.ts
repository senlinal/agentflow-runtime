import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { NativeSubAgentWorkflowPackBuilder } from "../core/opencode/NativeSubAgentWorkflowPackBuilder.ts";
import { NativeSubAgentWorkflowPackCollector } from "../core/opencode/NativeSubAgentWorkflowPackCollector.ts";

test("NativeSubAgentWorkflowPackCollector", async (t) => {
  await t.test("marks missing output.json files as pending without fabricating results", async () => {
    const baseRunDir = join(tmpdir(), `agentflow-native-collect-missing-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const pack = await new NativeSubAgentWorkflowPackBuilder().build({
      profileId: "agent-workforce-basic",
      task: "解释一下咖啡的做法",
      baseRunDir,
    });

    const result = await new NativeSubAgentWorkflowPackCollector().collect({ runId: pack.runId, baseRunDir });

    assert.equal(result.status, "partially_completed");
    assert.equal(result.completedCount, 0);
    assert.equal(result.pendingCount, 5);
    assert.equal(result.missingOutputs.length, 5);
    assert.equal(result.roleTimeline[0]?.source, "opencode_native_artifact");
    assert.equal(result.roleTimeline[0]?.status, "pending");
    assert.match(result.roleTimeline[0]?.summary ?? "", /output artifact not found/);
    assert.doesNotMatch(await readFile(result.summaryPath, "utf8"), /validated output artifact.*Planner/s);
  });

  await t.test("marks existing valid output.json files as completed", async () => {
    const baseRunDir = join(tmpdir(), `agentflow-native-collect-complete-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const pack = await new NativeSubAgentWorkflowPackBuilder().build({
      profileId: "agent-workforce-basic",
      task: "解释一下咖啡的做法",
      baseRunDir,
    });

    for (const task of pack.tasks) {
      await writeFile(task.outputArtifactPath, `${JSON.stringify(outputFor(task.role), null, 2)}\n`, "utf8");
    }

    const result = await new NativeSubAgentWorkflowPackCollector().collect({ runId: pack.runId, baseRunDir });

    assert.equal(result.status, "completed");
    assert.equal(result.completedCount, 5);
    assert.equal(result.pendingCount, 0);
    assert.equal(result.failedCount, 0);
    assert.equal(result.roleTimeline.every((event) => event.source === "opencode_native_artifact"), true);
    assert.equal(result.roleTimeline.every((event) => event.status === "completed"), true);
    assert.match(await readFile(result.tracePath, "utf8"), /opencode_native_artifact/);
  });
});

function outputFor(role: string): unknown {
  if (role === "Planner") {
    return {
      planId: "plan-native",
      summary: "Plan coffee answer.",
      steps: [{ id: "step-1", action: "Prepare answer", expectedOutput: "coffee steps" }],
      risks: [],
      successCriteria: ["answers user"],
      assumptions: [],
    };
  }
  if (role === "Debater") {
    return {
      issues: ["Need concrete coffee steps."],
      risks: [],
      missingRequirements: [],
      suggestions: ["Include ratio and temperature."],
      severity: "low",
    };
  }
  if (role === "PlannerRevision") {
    return {
      planId: "revised-native",
      summary: "Revise toward concrete coffee answer.",
      steps: [{ id: "step-1", action: "Write concrete answer", expectedOutput: "coffee recipe" }],
      risks: [],
      successCriteria: ["answers user"],
      assumptions: [],
      basedOnCritique: ["Need concrete coffee steps."],
      revisionNotes: ["Added ratio and temperature."],
    };
  }
  if (role === "Executor") {
    return {
      status: "success",
      deliverable: { type: "answer", content: "手冲咖啡：研磨咖啡豆，按 1:15 粉水比，用 90-96 摄氏度热水分段注水。" },
      completedSteps: ["wrote answer"],
      artifacts: [],
      summary: "Produced coffee answer.",
      errors: [],
      rawOutput: "Produced coffee answer.",
    };
  }
  return {
    pass: true,
    deliverableExists: true,
    answersUserRequest: true,
    meetsSuccessCriteria: true,
    isNotMetaOnly: true,
    score: 0.97,
    failedCriteria: [],
    reason: "Deliverable answers the coffee question.",
    nextAction: "end",
    feedbackToPlanner: "No revision needed.",
  };
}
