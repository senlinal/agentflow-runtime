import { NativeSubAgentWorkflowPackCollector } from "../../core/opencode/NativeSubAgentWorkflowPackCollector.ts";

export type AgentFlowNativeCollectInput = {
  run?: string;
  runId?: string;
};

export async function agentflowNativeCollect(input: AgentFlowNativeCollectInput): Promise<Record<string, unknown>> {
  const runId = (input.run ?? input.runId ?? "").trim();
  if (!runId) throw new Error("agentflow_native_collect requires run or runId.");
  const result = await new NativeSubAgentWorkflowPackCollector().collect({ runId });
  return {
    ...result,
    formattedText: [
      "AgentFlow Native Workflow Collect",
      "",
      `runId: ${result.runId}`,
      `status: ${result.status}`,
      `completed: ${result.completedCount}`,
      `pending: ${result.pendingCount}`,
      `failed: ${result.failedCount}`,
      `summaryPath: ${result.summaryPath}`,
      `tracePath: ${result.tracePath}`,
      "",
      "Role Timeline:",
      ...result.roleTimeline.flatMap((event) => [
        `${event.role}`,
        `  source: ${event.source}`,
        `  openCodeAgentName: ${event.openCodeAgentName}`,
        `  input: ${event.inputArtifactPath}`,
        `  output: ${event.outputArtifactPath}`,
        `  status: ${event.status}`,
        `  reason: ${event.summary}`,
      ]),
      ...(result.missingOutputs.length > 0
        ? [
          "",
          "Missing outputs:",
          ...result.missingOutputs.map((item) => `- ${item.role}: ${item.outputArtifactPath}`),
        ]
        : []),
      ...(result.warnings.length > 0
        ? [
          "",
          "Warnings:",
          ...result.warnings.map((item) => `- ${item}`),
        ]
        : []),
    ].join("\n"),
  };
}
