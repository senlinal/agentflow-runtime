import test from "node:test";
import assert from "node:assert/strict";
import { ProfileRunFormatter } from "../core/profile/ProfileRunFormatter.ts";
import type { ProfileWorkflowRunResult } from "../core/profile/ProfileWorkflowRunner.ts";

test("ProfileRunFormatter", async (t) => {
  await t.test("formats routing, role timeline, artifacts, and pending questions", () => {
    const text = new ProfileRunFormatter().format(sampleResult({
      finalStatus: "blocked",
      session: {
        sessionId: "profile_session_test",
        profileId: "rag-optimization",
        status: "pending_scope_confirmation",
        task: "检查项目不足",
        pendingQuestions: ["确认分析范围？"],
        createdAt: "2026-05-24T00:00:00.000Z",
        updatedAt: "2026-05-24T00:00:00.000Z",
      },
    }));

    assert.match(text, /AgentFlow Profile Run/);
    assert.match(text, /Routing Decision/);
    assert.match(text, /recommendedProfile: frontend-site-build/);
    assert.match(text, /AgentFlow Role Timeline/);
    assert.match(text, /Runtime Proof/);
    assert.match(text, /Agent Dispatch Proof/);
    assert.match(text, /dispatchModel: WorkflowRuntime trace -> SubAgentDispatcher artifacts/);
    assert.match(text, /subAgentDispatchCount: 1/);
    assert.match(text, /dispatchTargets: @agentflow-task-negotiator/);
    assert.match(text, /No subagent dispatch record, no subagent/);
    assert.match(text, /runtimeStarted: true/);
    assert.match(text, /verifiedRoleCount: 1/);
    assert.match(text, /1\. TaskNegotiator/);
    assert.match(text, /source: subagent_dispatch_trace/);
    assert.match(text, /subAgentDispatched: true/);
    assert.match(text, /subAgentId: taskNegotiator-0-test/);
    assert.match(text, /workerSessionId: worker-tasknegotiator-test/);
    assert.match(text, /nodeType: negotiate/);
    assert.match(text, /subagent: @agentflow-task-negotiator/);
    assert.match(text, /executorType: negotiate/);
    assert.match(text, /isMock: false/);
    assert.match(text, /isLLMBacked: false/);
    assert.match(text, /note: runtime executor type: negotiate/);
    assert.match(text, /inputArtifactPath: \.workflow-runs\/run\/subagents\/taskNegotiator-0-test\/input\.json/);
    assert.match(text, /outputArtifactPath: \.workflow-runs\/run\/subagents\/taskNegotiator-0-test\/output\.json/);
    assert.match(text, /outputKey: taskNegotiationResult/);
    assert.match(text, /outputSchema: TaskNegotiationResult/);
    assert.match(text, /summary: \.workflow-runs\/run\/summary\.md/);
    assert.match(text, /trace: \.workflow-runs\/run\/trace\.json/);
    assert.match(text, /context: \.workflow-runs\/run\/context\.json/);
    assert.match(text, /pendingQuestions/);
  });

  await t.test("formats blocked reasons through autonomy and steps", () => {
    const text = new ProfileRunFormatter().format(sampleResult({
      finalStatus: "blocked",
      steps: [{
        workflow: "code-test-verify",
        status: "blocked",
        reason: "Workflow contains execution-capable nodes and allowExecution=false.",
      }],
      roleTimeline: [{
        workflow: "code-test-verify",
        nodeId: "code-test-verify",
        role: "Workflow",
        status: "blocked",
        summary: "Workflow contains execution-capable nodes and allowExecution=false.",
      }],
      runtimeProof: {
        runtimeStarted: false,
        verifiedRoleCount: 0,
        roleSource: "unavailable",
      },
    }));

    assert.match(text, /Final status: blocked/);
    assert.match(text, /Workflow contains execution-capable nodes/);
    assert.match(text, /AgentFlow Runtime was not started/);
    assert.match(text, /dispatchModel: unavailable/);
    assert.match(text, /Next Actions/);
  });

  await t.test("does not fabricate role timeline when trace is unavailable", () => {
    const text = new ProfileRunFormatter().format(sampleResult({
      roleTimeline: [],
      executedWorkflows: ["abcde-basic"],
      runtimeProof: {
        runtimeStarted: false,
        tracePath: ".workflow-runs/run/trace.json",
        verifiedRoleCount: 0,
        roleSource: "unavailable",
      },
    }));

    assert.match(text, /AgentFlow Runtime trace not found. No verified agents can be displayed./);
    assert.doesNotMatch(text, /1\\. Planner/);
  });

  await t.test("formats llm-backed role execution evidence", () => {
    const text = new ProfileRunFormatter().format(sampleResult({
      roleTimeline: [{
        workflow: "abcde-basic-llm",
        nodeId: "planner",
        role: "Planner",
        nodeType: "llm",
        executorType: "llm",
        type: "llm",
        status: "completed",
        summary: "Plan coffee answer.",
        outputKey: "plan",
        outputSchema: "Plan",
        source: "subagent_dispatch_trace",
        subAgentDispatched: true,
        subAgentId: "planner-0-test",
        workerSessionId: "worker-planner-test",
        inputArtifactPath: ".workflow-runs/run/subagents/planner-0-test/input.json",
        outputArtifactPath: ".workflow-runs/run/subagents/planner-0-test/output.json",
        subAgentMetadataPath: ".workflow-runs/run/subagents/planner-0-test/metadata.json",
        nextNode: "debater",
        isMock: false,
        isLLMBacked: true,
        modelProvider: "deepseek",
        modelName: "deepseek-v4-flash",
        callStatus: "completed",
      }],
      runtimeProof: {
        runtimeStarted: true,
        tracePath: ".workflow-runs/run/trace.json",
        contextPath: ".workflow-runs/run/context.json",
        verifiedRoleCount: 1,
        roleSource: "subagent_dispatch_trace",
      },
    }));

    assert.match(text, /executorType: llm/);
    assert.match(text, /isLLMBacked: true/);
    assert.match(text, /modelProvider: deepseek/);
    assert.match(text, /modelName: deepseek-v4-flash/);
    assert.match(text, /callStatus: completed/);
    assert.match(text, /note: llm-backed subagent execution/);
  });
});

function sampleResult(overrides: Partial<ProfileWorkflowRunResult> = {}): ProfileWorkflowRunResult {
  return {
    profileId: "frontend-site-build",
    profileName: "Frontend Site Build Profile",
    workflowChain: ["task-negotiation", "code-test-verify"],
    taskBrief: {
      taskId: "task_test",
      goal: "检查项目不足",
      currentState: "test",
      constraints: [],
      resources: [],
      budget: "none",
      successCriteria: [],
      nonGoals: [],
      rawUserInput: "检查项目不足",
    },
    dryRun: false,
    allowExecution: false,
    steps: [{
      workflow: "task-negotiation",
      status: "ran",
      reason: "Workflow completed under profile runner.",
      runId: "run",
      summaryPath: ".workflow-runs/run/summary.md",
      tracePath: ".workflow-runs/run/trace.json",
      contextPath: ".workflow-runs/run/context.json",
      enteredExecutor: false,
    }],
    roleTimeline: [
      {
        workflow: "task-negotiation",
        nodeId: "taskNegotiator",
        role: "TaskNegotiator",
        nodeType: "negotiate",
        executorType: "negotiate",
        type: "negotiate",
        status: "completed",
        summary: "Need scope confirmation.",
        outputKey: "taskNegotiationResult",
        outputSchema: "TaskNegotiationResult",
        source: "subagent_dispatch_trace",
        subAgentDispatched: true,
        subAgentId: "taskNegotiator-0-test",
        workerSessionId: "worker-tasknegotiator-test",
        inputArtifactPath: ".workflow-runs/run/subagents/taskNegotiator-0-test/input.json",
        outputArtifactPath: ".workflow-runs/run/subagents/taskNegotiator-0-test/output.json",
        subAgentMetadataPath: ".workflow-runs/run/subagents/taskNegotiator-0-test/metadata.json",
        nextNode: "end",
        runId: "run",
        summaryPath: ".workflow-runs/run/summary.md",
        tracePath: ".workflow-runs/run/trace.json",
        contextPath: ".workflow-runs/run/context.json",
        isMock: false,
        isLLMBacked: false,
      },
    ],
    executedWorkflows: ["task-negotiation"],
    summaryPaths: [".workflow-runs/run/summary.md"],
    tracePaths: [".workflow-runs/run/trace.json"],
    contextPaths: [".workflow-runs/run/context.json"],
    summaryPath: ".workflow-runs/run/summary.md",
    tracePath: ".workflow-runs/run/trace.json",
    contextPath: ".workflow-runs/run/context.json",
    warnings: [],
    finalStatus: "blocked",
    nextActions: ["Answer scope questions."],
    originalProfileId: "rag-optimization",
    profileSwitched: true,
    profileRoutingDecision: {
      currentProfile: "rag-optimization",
      detectedTaskType: "frontend_site_build",
      recommendedProfile: "frontend-site-build",
      confidence: "high",
      reason: "website task",
      shouldSwitch: true,
      safeToAutoSwitch: true,
      warnings: [],
    },
    autonomyDecision: {
      decision: "proceed_with_assumptions",
      reason: "no compacted memory",
      confidence: "medium",
      canProceed: true,
      mustAskHuman: false,
      assumptions: [],
      questionsToAsk: [],
      blockedReasons: [],
      safetyFindings: [],
      referencedMemoryIds: [],
      nextAllowedActions: ["task-negotiation"],
      createdAt: "2026-05-24T00:00:00.000Z",
    },
    memorySummary: {
      profileId: "frontend-site-build",
      records: [],
      activeConfirmedScopes: [],
      activeDecisions: [],
      triedRoutes: [],
      rejectedRoutes: [],
      openQuestions: [],
      nextActions: [],
    },
    runtimeProof: {
      runtimeStarted: true,
      tracePath: ".workflow-runs/run/trace.json",
      contextPath: ".workflow-runs/run/context.json",
      verifiedRoleCount: 1,
      roleSource: "runtime_trace",
    },
    formattedText: "",
    ...overrides,
  };
}
