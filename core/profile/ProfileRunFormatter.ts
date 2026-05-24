import type { ProfileRoleTimelineEvent, ProfileWorkflowRunResult, ProfileWorkflowStep } from "./ProfileWorkflowRunner.ts";

export class ProfileRunFormatter {
  format(result: ProfileWorkflowRunResult): string {
    const lines: string[] = [
      "AgentFlow Profile Run",
      "",
      `Profile: ${result.profileId} (${result.profileName})`,
      `Task: ${result.taskBrief.rawUserInput ?? result.taskBrief.goal}`,
      `Final status: ${result.finalStatus}`,
      `Dry run: ${result.dryRun}`,
      `Allow execution: ${result.allowExecution}`,
      "",
      "Routing Decision",
      ...formatRouting(result),
      "",
      "Autonomy Decision",
      ...formatAutonomy(result),
      "",
      "Executed Workflows",
      result.executedWorkflows.length > 0 ? `- ${result.executedWorkflows.join(" -> ")}` : "- none",
      "",
      "Workflow Steps",
      ...formatSteps(result.steps),
      "",
      "Runtime Proof",
      ...formatRuntimeProof(result),
      "",
      "AgentFlow Role Timeline",
      ...formatTimeline(result),
      "",
      "Artifacts",
      ...formatArtifacts(result),
      "",
      "Warnings",
      ...(result.warnings.length > 0 ? result.warnings.map((warning) => `- ${warning}`) : ["- none"]),
      "",
      "Next Actions",
      ...result.nextActions.map((action) => `- ${action}`),
    ];

    if (result.session) {
      lines.splice(lines.indexOf("Artifacts"), 0, "Profile Session", ...formatSession(result), "");
    }

    return lines.join("\n");
  }
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

function formatTimeline(result: ProfileWorkflowRunResult): string[] {
  const events = result.roleTimeline.filter((event) => event.source === "runtime_trace");
  if (events.length === 0) {
    if (result.executedWorkflows.length === 0) return ["- No AgentFlow workflow was executed."];
    return ["- AgentFlow Runtime trace not found. No verified agents can be displayed."];
  }
  return events.map((event, index) => {
    const parts = [
      `${index + 1}. ${event.role}`,
      `   workflow: ${event.workflow ?? "n/a"}`,
      `   nodeId: ${event.nodeId}`,
      `   nodeType: ${event.nodeType ?? event.type ?? "unknown"}`,
      `   executorType: ${event.executorType ?? event.type ?? "unknown"}`,
      `   type: ${event.type ?? event.executorType ?? "unknown"}`,
      `   status: ${event.status}`,
      `   outputKey: ${event.outputKey ?? "n/a"}`,
      `   outputSchema: ${event.outputSchema ?? "n/a"}`,
      `   source: ${event.source}`,
      `   isMock: ${event.isMock === true}`,
      `   isLLMBacked: ${event.isLLMBacked === true}`,
      `   note: ${roleExecutionNote(event)}`,
      `   next: ${event.nextNode ?? "n/a"}`,
      `   output: ${event.summary ?? "n/a"}`,
    ];
    if (event.summaryPath) parts.push(`   summary: ${event.summaryPath}`);
    if (event.tracePath) parts.push(`   trace: ${event.tracePath}`);
    if (event.contextPath) parts.push(`   context: ${event.contextPath}`);
    return parts.join("\n");
  });
}

function roleExecutionNote(event: ProfileRoleTimelineEvent): string {
  if (event.isLLMBacked) return "llm-backed role execution";
  if (event.isMock) return "mock simulation, not LLM-backed";
  return `runtime executor type: ${event.executorType ?? event.type ?? "unknown"}`;
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
