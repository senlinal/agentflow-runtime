import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { RoleSpeechExtractor, type RoleSpeechTimelineEvent } from "../core/subagent/RoleSpeechExtractor.ts";
import type { SubAgentDispatchMetadata } from "../core/types.ts";

test("RoleSpeechExtractor", async (t) => {
  await t.test("extracts role speeches from subagent output artifacts", async () => {
    const runDir = join(tmpdir(), `agentflow-speech-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const events: RoleSpeechTimelineEvent[] = [];
    events.push(await writeSubAgent(runDir, "planner-0", "Planner", "mock", {
      taskUnderstanding: "用户想了解咖啡的做法。",
      proposedApproach: "先说明器具，再说明步骤。",
      deliverablePlan: "输出一段可直接使用的咖啡做法。",
      steps: [{ action: "准备咖啡豆和热水", expectedOutput: "材料齐全" }],
    }));
    events.push(await writeSubAgent(runDir, "debater-1", "Debater", "mock", {
      issues: ["计划需要说明水温"],
      risks: ["步骤太笼统"],
      suggestions: ["补充研磨度和萃取时间"],
      missingRequirements: [],
    }));
    events.push(await writeSubAgent(runDir, "plannerRevision-2", "PlannerRevision", "mock", {
      summary: "我已修订计划。",
      revisionNotes: ["加入水温和研磨度"],
      basedOnCritique: ["回应 Debater 对水温的批评"],
      steps: [{ action: "按修订步骤输出咖啡做法" }],
    }));
    events.push(await writeSubAgent(runDir, "executor-3", "Executor", "mock", {
      deliverable: {
        type: "answer",
        content: "手冲咖啡需要咖啡豆、滤杯、滤纸、热水。先磨豆，再注水焖蒸，最后分段萃取。",
      },
      summary: "生成咖啡做法。",
      completedSteps: ["写出材料", "写出步骤"],
      artifacts: [],
      errors: [],
      rawOutput: "answer",
    }));
    events.push(await writeSubAgent(runDir, "verifier-4", "Verifier", "llm", {
      pass: true,
      score: 0.97,
      answersUserRequest: true,
      isNotMetaOnly: true,
      failedCriteria: [],
      reason: "交付物真实回答了咖啡做法。",
      feedbackToPlanner: "无需返工。",
    }, { isLLMBacked: true, modelProvider: "deepseek", modelName: "deepseek-v4-flash", callStatus: "completed" }));
    events.push(await writeSubAgent(runDir, "goalkeeper-5", "GoalKeeper", "mock", {
      originalGoalReminder: "保持回答咖啡做法。",
      correctionInstructions: ["补充关键步骤"],
      failedCriteria: ["缺少水温"],
      recommendedNextAction: "replan",
    }));

    const transcript = await new RoleSpeechExtractor().extract({
      runId: "run",
      profileId: "agent-workforce-basic",
      task: "解释一下咖啡的做法",
      roleTimeline: events,
    });

    assert.equal(transcript.speeches.length, 6);
    assert.match(transcript.speeches[0].speech, /用户想了解咖啡的做法/);
    assert.match(transcript.speeches[1].speech, /水温/);
    assert.match(transcript.speeches[2].speech, /回应 Debater/);
    assert.match(transcript.speeches[3].speech, /手冲咖啡需要咖啡豆/);
    assert.match(transcript.speeches[4].speech, /answersUserRequest=true/);
    assert.match(transcript.speeches[4].speech, /isNotMetaOnly=true/);
    assert.match(transcript.speeches[4].speech, /pass=true/);
    assert.match(transcript.speeches[5].speech, /补充关键步骤/);
    assert.equal(transcript.speeches.every((speech) => speech.source === "subagent_output"), true);
    assert.equal(transcript.speeches[0].title, "Planner [mock simulation]");
    assert.equal(transcript.speeches[4].title, "Verifier [llm-backed]");
  });

  await t.test("falls back to summary.md when output.json is unavailable", async () => {
    const runDir = join(tmpdir(), `agentflow-speech-summary-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const event = await writeSubAgent(runDir, "planner-0", "Planner", "mock", undefined, {}, "## Output Preview\n\nsummary fallback speech");

    const transcript = await new RoleSpeechExtractor().extract({ runId: "run", roleTimeline: [event] });

    assert.equal(transcript.speeches[0].source, "subagent_summary");
    assert.match(transcript.speeches[0].speech, /summary fallback speech/);
    assert.ok(transcript.speeches[0].artifactPath?.endsWith("summary.md"));
  });

  await t.test("marks speech unavailable when artifacts are missing", async () => {
    const transcript = await new RoleSpeechExtractor().extract({
      runId: "run",
      roleTimeline: [{
        role: "Planner",
        nodeId: "planner",
        subAgentId: "planner-0",
        workerSessionId: "worker-planner",
        executorType: "mock",
        isMock: true,
        isLLMBacked: false,
        source: "subagent_dispatch_trace",
        outputArtifactPath: "/tmp/missing-agentflow-output.json",
        subAgentMetadataPath: "/tmp/missing-agentflow-metadata.json",
      }],
    });

    assert.equal(transcript.speeches[0].source, "unavailable");
    assert.match(transcript.speeches[0].speech, /Role speech unavailable/);
    assert.doesNotMatch(transcript.speeches[0].speech, /我已经根据用户目标制定了计划/);
  });
});

async function writeSubAgent(
  runDir: string,
  subAgentId: string,
  role: string,
  executorType: "mock" | "llm",
  output?: unknown,
  metadataOverrides: Partial<SubAgentDispatchMetadata> = {},
  summary = "## Output Preview\n\nfallback",
): Promise<RoleSpeechTimelineEvent> {
  const dir = join(runDir, "subagents", subAgentId);
  await mkdir(dir, { recursive: true });
  const outputArtifactPath = join(dir, "output.json");
  const metadataPath = join(dir, "metadata.json");
  const summaryPath = join(dir, "summary.md");
  if (output !== undefined) await writeFile(outputArtifactPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await writeFile(summaryPath, `${summary}\n`, "utf8");
  const metadata: SubAgentDispatchMetadata = {
    subAgentId,
    workerSessionId: `worker-${subAgentId}`,
    nodeId: subAgentId.replace(/-\d+$/, ""),
    role: role as SubAgentDispatchMetadata["role"],
    executorType,
    isMock: executorType === "mock",
    isLLMBacked: false,
    callStatus: executorType === "mock" ? "not_applicable" : undefined,
    inputKeys: ["taskBrief"],
    outputKey: role === "Executor" ? "executionResult" : role === "Verifier" ? "verification" : "plan",
    outputSchema: role === "Executor" ? "ExecutionResult" : role === "Verifier" ? "VerificationReport" : "Plan",
    startedAt: "2026-05-25T00:00:00.000Z",
    completedAt: "2026-05-25T00:00:01.000Z",
    inputArtifactPath: join(dir, "input.json"),
    outputArtifactPath,
    metadataPath,
    summaryPath,
    ...metadataOverrides,
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return {
    role,
    nodeId: metadata.nodeId,
    subAgentId,
    workerSessionId: metadata.workerSessionId,
    executorType,
    isMock: metadata.isMock,
    isLLMBacked: metadata.isLLMBacked,
    source: "subagent_dispatch_trace",
    outputKey: String(metadata.outputKey),
    outputSchema: metadata.outputSchema,
    outputArtifactPath,
    subAgentMetadataPath: metadataPath,
  };
}
