import assert from "node:assert/strict";
import test from "node:test";
import { RoleSpeechFormatter } from "../core/subagent/RoleSpeechFormatter.ts";
import type { RoleSpeechTranscript } from "../core/types.ts";

test("RoleSpeechFormatter", () => {
  const transcript: RoleSpeechTranscript = {
    runId: "run",
    profileId: "agent-workforce-basic",
    task: "解释 RAG 流程",
    createdAt: "2026-05-25T00:00:00.000Z",
    warnings: [],
    speeches: [{
      role: "Planner",
      nodeId: "planner",
      subAgentId: "planner-0",
      workerSessionId: "worker-planner",
      executorType: "mock",
      isMock: true,
      isLLMBacked: false,
      source: "subagent_output",
      title: "Planner [mock simulation]",
      speech: "[mock simulation] 我理解这个任务是解释 RAG 的完整流程。",
      outputKey: "plan",
      outputSchema: "Plan",
      artifactPath: ".workflow-runs/run/subagents/planner-0/output.json",
      createdAt: "2026-05-25T00:00:01.000Z",
    }, {
      role: "Verifier",
      nodeId: "verifier",
      subAgentId: "verifier-1",
      workerSessionId: "worker-verifier",
      executorType: "llm",
      isMock: false,
      isLLMBacked: true,
      source: "unavailable",
      title: "Verifier [llm-backed]",
      speech: "[llm-backed] Role speech unavailable because no readable subagent output.json or summary.md artifact was found.",
    }],
  };

  const text = new RoleSpeechFormatter().format(transcript);

  assert.match(text, /AgentFlow 角色发言流/);
  assert.match(text, /Task: 解释 RAG 流程/);
  assert.match(text, /Profile: agent-workforce-basic/);
  assert.match(text, /Planner \[mock simulation\]/);
  assert.match(text, /我理解这个任务是解释 RAG 的完整流程/);
  assert.match(text, /artifact: \.workflow-runs\/run\/subagents\/planner-0\/output\.json/);
  assert.match(text, /Verifier \[llm-backed\]/);
  assert.match(text, /source: unavailable/);
  assert.match(text, /Role speech unavailable/);
});
