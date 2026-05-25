import type { ProfileRoleTimelineEvent, ProfileWorkflowRunResult, ProfileWorkflowStep } from "./ProfileWorkflowRunner.ts";
import type { RoleSpeech } from "../types.ts";

export class ProfileRunFormatter {
  format(result: ProfileWorkflowRunResult): string {
    if (!result.runtimeProof.runtimeStarted || result.finalStatus === "blocked") return formatBlocked(result).join("\n");
    return [
      "AgentFlow 工作流完成",
      "",
      `Profile: ${result.profileId}`,
      `状态: ${result.finalStatus}`,
      `说明: ${formatRunNote(result)}`,
      "",
      "角色发言：",
      ...formatRoleSpeeches(result),
      ...formatOpenCodeNativeProof(result),
      "",
      "产物:",
      ...formatConciseArtifacts(result),
    ].join("\n");
  }
}

function formatOpenCodeNativeProof(result: ProfileWorkflowRunResult): string[] {
  const events = result.roleTimeline.filter((event) => event.dispatchMode === "hybrid" || event.dispatchMode === "opencode-native");
  if (events.length === 0) return [];
  return [
    "Role Timeline / OpenCode native subagent:",
    ...events.map((event) => {
      const agent = event.openCodeAgentName ?? openCodeSubAgentName(event) ?? "n/a";
      const status = event.nativeDispatchStatus ?? "unavailable";
      const task = event.openCodeTaskId ?? "no openCodeTaskId";
      return `${event.role}: ${agent}, openCodeNativeSubAgent=${event.openCodeNativeSubAgent === true}, nativeDispatchStatus=${status}, ${task}`;
    }),
    "",
  ];
}

function formatBlocked(result: ProfileWorkflowRunResult): string[] {
  return [
    "AgentFlow 工作流受阻",
    "",
    `Profile: ${result.profileId}`,
    `状态: ${result.finalStatus}`,
    `原因: ${blockedReason(result.steps) ?? result.warnings[0] ?? "runtime 未启动或缺少可验证角色"}`,
    "",
    "产物:",
    ...formatConciseArtifacts(result),
  ];
}

function formatRunNote(result: ProfileWorkflowRunResult): string {
  const events = result.roleTimeline.filter(isVerifiedRoleEvent);
  const llmEvents = events.filter((event) => event.isLLMBacked === true);
  const mockCount = events.filter((event) => event.isMock === true).length;
  if (events.some((event) => event.dispatchMode === "hybrid" || event.dispatchMode === "opencode-native")) {
    const unavailable = events.some((event) => event.openCodeNativeSubAgent !== true);
    return unavailable
      ? "本次写入 AgentFlow internal subagent artifacts；OpenCode native subagent dispatch unavailable，未伪造 OpenCode task"
      : "本次包含 OpenCode native subagent dispatch evidence";
  }
  if (events.length > 0 && mockCount === events.length) return "本次为 mock subagent simulation，不是 LLM-backed agent";
  if (llmEvents.length > 0) {
    const models = [...new Set(llmEvents.map((event) => [event.modelProvider, event.modelName].filter(Boolean).join("/")).filter(Boolean))];
    const roles = [...new Set(llmEvents.map((event) => event.role))].join(", ");
    return `本次包含 LLM-backed agent：${roles}${models.length > 0 ? `（${models.join(", ")}）` : ""}`;
  }
  if (events.length > 0) return "本次为 AgentFlow runtime verified workflow";
  return "没有可展示的角色发言 artifact";
}

function formatRoleSpeeches(result: ProfileWorkflowRunResult): string[] {
  const speeches = result.roleSpeechTranscript.speeches;
  if (speeches.length === 0) return ["unavailable: 没有可读取的 subagent output.json 或 summary.md。"];
  return speeches.flatMap((speech) => [
    `${speech.role}:`,
    conciseSpeech(speech),
    "",
  ]);
}

function conciseSpeech(speech: RoleSpeech): string {
  if (speech.source === "unavailable") return "unavailable: 没有可读取的角色输出 artifact。";
  return speech.speech.trim();
}

function formatConciseArtifacts(result: ProfileWorkflowRunResult): string[] {
  const lines: string[] = [];
  const summary = result.summaryPaths[0];
  const trace = result.tracePaths[0] ?? result.runtimeProof.tracePath;
  if (summary) lines.push(`summary: ${summary}`);
  if (trace) lines.push(`trace: ${trace}`);
  if (lines.length === 0) lines.push("summary: unavailable", "trace: unavailable");
  return lines;
}

function formatRouting(result: ProfileWorkflowRunResult): string[] {
  const decision = result.routingDecision ?? result.profileRoutingDecision;
  if (!decision) {
    return [
      `- currentProfile: ${result.originalProfileId ?? result.profileId}`,
      `- recommendedProfile: ${result.profileId}`,
      `- switched: ${result.profileSwitched}`,
      "- reason: no task routing decision was needed",
    ];
  }
  return [
    `- currentProfile: ${result.originalProfileId ?? decision.currentProfile}`,
    `- detectedTaskType: ${decision.detectedTaskType}`,
    `- recommendedProfile: ${decision.recommendedProfile ?? "none"}`,
    `- switched: ${result.profileSwitched}`,
    `- confidence: ${decision.confidence}`,
    `- safeToAutoSwitch: ${decision.safeToAutoSwitch}`,
    `- reason: ${decision.reason}`,
  ];
}

function formatAutonomy(result: ProfileWorkflowRunResult): string[] {
  const decision = result.autonomyDecision;
  if (!decision) return ["- none"];
  return [
    `- decision: ${decision.decision}`,
    `- canProceed: ${decision.canProceed}`,
    `- mustAskHuman: ${decision.mustAskHuman}`,
    `- confidence: ${decision.confidence}`,
    `- reason: ${decision.reason}`,
    `- blockedReasons: ${decision.blockedReasons.join(" | ") || "none"}`,
  ];
}

function formatSteps(steps: ProfileWorkflowStep[]): string[] {
  if (steps.length === 0) return ["- none"];
  return steps.map((step) => `- ${step.workflow}: ${step.status} - ${step.reason}`);
}

function formatRuntimeProof(result: ProfileWorkflowRunResult): string[] {
  const proof = result.runtimeProof;
  return [
    `- runtimeStarted: ${proof.runtimeStarted}`,
    `- tracePath: ${proof.tracePath ?? "n/a"}`,
    `- contextPath: ${proof.contextPath ?? "n/a"}`,
    `- verifiedRoleCount: ${proof.verifiedRoleCount}`,
    `- roleSource: ${proof.roleSource}`,
    ...(proof.runtimeStarted
      ? []
      : ["- AgentFlow Runtime was not started. This is not a verified multi-agent run."]),
  ];
}

function formatDispatchProof(result: ProfileWorkflowRunResult): string[] {
  const events = result.roleTimeline.filter(isVerifiedRoleEvent);
  if (events.length === 0) {
    return [
      "- dispatchModel: unavailable",
      "- subAgentDispatch: false",
      "- reason: no runtime trace roles were verified",
    ];
  }
  const llmCount = events.filter((event) => event.isLLMBacked === true).length;
  const mockCount = events.filter((event) => event.isMock === true).length;
  const runtimeNodeCount = events.length;
  const subAgents = [...new Set(events.map((event) => openCodeSubAgentName(event)).filter(Boolean))];
  return [
    "- dispatchModel: WorkflowRuntime trace -> SubAgentDispatcher artifacts",
    `- roleSource: ${events.some((event) => event.source === "subagent_dispatch_trace") ? "subagent_dispatch_trace" : "runtime_trace"}`,
    `- runtimeNodeCount: ${runtimeNodeCount}`,
    `- subAgentDispatchCount: ${events.filter((event) => event.subAgentDispatched === true).length}`,
    `- llmBackedNodeCount: ${llmCount}`,
    `- mockNodeCount: ${mockCount}`,
    "- subAgentDispatchRecords: required_for_subagent_claims",
    `- dispatchTargets: ${subAgents.length > 0 ? subAgents.map((agent) => `@${agent}`).join(", ") : "none"}`,
    "- note: No subagent dispatch record, no subagent. Mock dispatches remain simulations unless the executor is llm-backed.",
  ];
}

function formatTimeline(result: ProfileWorkflowRunResult): string[] {
  const events = result.roleTimeline.filter(isVerifiedRoleEvent);
  if (events.length === 0) {
    if (result.executedWorkflows.length === 0) return ["- No AgentFlow workflow was executed."];
    return ["- AgentFlow Runtime trace not found. No verified agents can be displayed."];
  }
  return events.map((event, index) => {
    const status = [
      event.isLLMBacked ? "llm-backed" : event.isMock ? "mock simulation" : event.executorType ?? event.type ?? "runtime",
      event.status,
      event.subAgentDispatched === true ? `subAgent=${event.subAgentId ?? "dispatched"}` : "subAgent=none",
    ].filter(Boolean).join(", ");
    const parts = [
      `${index + 1}. ${event.role}: ${status}`,
      `   node: ${event.nodeId} (${event.outputKey ?? "output"} -> ${event.outputSchema ?? "schema n/a"})`,
      `   outputKey: ${event.outputKey ?? "n/a"}`,
      `   outputSchema: ${event.outputSchema ?? "n/a"}`,
      `   subagent: ${event.subAgentDispatched === true && openCodeSubAgentName(event) ? `@${openCodeSubAgentName(event)}` : "n/a"}`,
      `   nodeType: ${event.nodeType ?? event.type ?? "unknown"}`,
      `   executorType: ${event.executorType ?? event.type ?? "unknown"}`,
      `   source: ${event.source}`,
      `   subAgentDispatched: ${event.subAgentDispatched === true}`,
      ...(event.dispatchMode ? [`   dispatchMode: ${event.dispatchMode}`] : []),
      ...(typeof event.internalSubAgentDispatched === "boolean" ? [`   internalSubAgentDispatched: ${event.internalSubAgentDispatched}`] : []),
      ...(typeof event.openCodeNativeSubAgent === "boolean" ? [`   openCodeNativeSubAgent: ${event.openCodeNativeSubAgent}`] : []),
      ...(event.openCodeAgentName ? [`   openCodeAgentName: ${event.openCodeAgentName}`] : []),
      ...(event.openCodeTaskId ? [`   openCodeTaskId: ${event.openCodeTaskId}`] : []),
      ...(event.openCodeSessionId ? [`   openCodeSessionId: ${event.openCodeSessionId}`] : []),
      ...(event.nativeDispatchStatus ? [`   nativeDispatchStatus: ${event.nativeDispatchStatus}`] : []),
      ...(event.nativeDispatchLimitations?.length ? [`   limitations: ${event.nativeDispatchLimitations.join(" | ")}`] : []),
      `   subAgentId: ${event.subAgentId ?? "n/a"}`,
      `   isMock: ${event.isMock === true}`,
      `   isLLMBacked: ${event.isLLMBacked === true}`,
      ...(event.attemptNumber ? [`   attempt: ${event.attemptNumber}`] : []),
      ...(event.routeId ? [`   routeId: ${event.routeId}`] : []),
      ...(event.attemptDecision ? [`   attemptDecision: ${event.attemptDecision}`] : []),
      ...(event.retryReason ? [`   retryReason: ${event.retryReason}`] : []),
      ...(event.stopReason ? [`   stopReason: ${event.stopReason}`] : []),
      `   workerSessionId: ${event.workerSessionId ?? "n/a"}`,
      ...(event.modelProvider ? [`   modelProvider: ${event.modelProvider}`] : []),
      ...(event.modelName ? [`   modelName: ${event.modelName}`] : []),
      ...(event.callStatus ? [`   callStatus: ${event.callStatus}`] : []),
      `   note: ${roleExecutionNote(event)}`,
      `   next: ${event.nextNode ?? "end"}`,
    ];
    if (event.inputArtifactPath) parts.push(`   inputArtifactPath: ${event.inputArtifactPath}`);
    if (event.outputArtifactPath) parts.push(`   outputArtifactPath: ${event.outputArtifactPath}`);
    if (event.deliverableType) parts.push(`   deliverable: ${event.deliverableType}`);
    if (event.deliverablePreview) parts.push(`   contentPreview: "${event.deliverablePreview}"`);
    if (typeof event.answersUserRequest === "boolean") parts.push(`   answersUserRequest: ${event.answersUserRequest}`);
    if (typeof event.isNotMetaOnly === "boolean") parts.push(`   isNotMetaOnly: ${event.isNotMetaOnly}`);
    if (typeof event.pass === "boolean") parts.push(`   pass: ${event.pass}`);
    return parts.join("\n");
  });
}

function roleExecutionNote(event: ProfileRoleTimelineEvent): string {
  if (event.subAgentDispatched !== true) return "workflow node executed; no subagent dispatch record";
  if (event.isLLMBacked) return "llm-backed subagent execution";
  if (event.isMock) return "mock subagent simulation, not LLM-backed";
  return `runtime executor type: ${event.executorType ?? event.type ?? "unknown"}`;
}

function isVerifiedRoleEvent(event: ProfileRoleTimelineEvent): boolean {
  return event.source === "runtime_trace" || event.source === "subagent_dispatch_trace";
}

function openCodeSubAgentName(event: ProfileRoleTimelineEvent): string | undefined {
  if (event.openCodeSubAgentName) return event.openCodeSubAgentName;
  if (!event.role) return undefined;
  return `agentflow-${event.role.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
}

function formatArtifacts(result: ProfileWorkflowRunResult): string[] {
  const lines: string[] = [];
  pushPaths(lines, "summary", result.summaryPaths);
  pushPaths(lines, "trace", result.tracePaths);
  pushPaths(lines, "context", result.contextPaths);
  if (lines.length === 0) lines.push("- none");
  return lines;
}

function pushPaths(lines: string[], label: string, paths: string[]): void {
  if (paths.length === 0) return;
  for (const path of paths) lines.push(`- ${label}: ${path}`);
}

function formatSession(result: ProfileWorkflowRunResult): string[] {
  const session = result.session;
  if (!session) return [];
  const lines = [
    `- sessionId: ${session.sessionId}`,
    `- status: ${session.status}`,
  ];
  if (session.scopeConfirmationId) lines.push(`- scopeConfirmationId: ${session.scopeConfirmationId}`);
  if (session.pendingQuestions.length > 0) {
    lines.push("- pendingQuestions:");
    for (const question of session.pendingQuestions) lines.push(`  - ${question}`);
  }
  return lines;
}

export function formatProfileRun(result: ProfileWorkflowRunResult): string {
  return new ProfileRunFormatter().format(result);
}

export function blockedReason(steps: ProfileWorkflowStep[]): string | null {
  return steps.find((step) => step.status === "blocked")?.reason ?? null;
}
