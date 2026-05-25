import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readPath } from "../context.ts";
import { OpenCodeSubAgentBridge } from "../opencode/OpenCodeSubAgentBridge.ts";
import type { AgentNode, OpenCodeSubAgentDispatchResult, SubAgentDispatchMetadata, SubAgentDispatchMode, WorkflowContext } from "../types.ts";
import { SubAgentArtifactStore, type SubAgentArtifactRecord } from "./SubAgentArtifactStore.ts";

export type SubAgentDispatchHandle = {
  metadata: SubAgentDispatchMetadata;
  input: Record<string, unknown>;
};

export type SubAgentDispatcherOptions = {
  dispatchMode?: SubAgentDispatchMode;
  openCodeBridge?: OpenCodeSubAgentBridge;
  runId?: string;
  runDir?: string;
  profileId?: string;
};

export class SubAgentDispatcher {
  private readonly store: SubAgentArtifactStore;
  private readonly options: Required<Pick<SubAgentDispatcherOptions, "dispatchMode">> & Omit<SubAgentDispatcherOptions, "dispatchMode">;

  constructor(store: SubAgentArtifactStore, options: SubAgentDispatcherOptions = {}) {
    this.store = store;
    this.options = { ...options, dispatchMode: options.dispatchMode ?? "internal" };
  }

  async start(node: AgentNode, context: WorkflowContext, step: number): Promise<SubAgentDispatchHandle> {
    const subAgentId = `${node.id}-${step}-${randomUUID().slice(0, 8)}`;
    const workerSessionId = `worker-${node.role.toLowerCase()}-${randomUUID().slice(0, 8)}`;
    const dir = this.store.subAgentDir(subAgentId);
    const input = Object.fromEntries(node.inputKeys.map((key) => [key, readPath(context, key)]));
    const openCodeNativeDispatch = await this.dispatchOpenCodeNative(node, input);
    const metadata: SubAgentDispatchMetadata = {
      subAgentId,
      workerSessionId,
      nodeId: node.id,
      role: node.role,
      executorType: node.type,
      isMock: node.type === "mock",
      isLLMBacked: false,
      callStatus: node.type === "llm" ? undefined : "not_applicable",
      inputKeys: node.inputKeys,
      outputKey: node.outputKey,
      outputSchema: node.outputSchema,
      startedAt: new Date().toISOString(),
      inputArtifactPath: join(dir, "input.json"),
      outputArtifactPath: join(dir, "output.json"),
      metadataPath: join(dir, "metadata.json"),
      promptPath: join(dir, "prompt.md"),
      summaryPath: join(dir, "summary.md"),
      dispatchMode: this.options.dispatchMode,
      internalSubAgentDispatched: true,
      ...nativeMetadata(openCodeNativeDispatch),
    };
    await this.store.start({
      metadata,
      input,
      prompt: node.systemPrompt ?? node.description,
    });
    return { metadata, input };
  }

  private async dispatchOpenCodeNative(
    node: AgentNode,
    input: Record<string, unknown>,
  ): Promise<OpenCodeSubAgentDispatchResult | undefined> {
    if (this.options.dispatchMode === "internal") return undefined;
    const bridge = this.options.openCodeBridge ?? new OpenCodeSubAgentBridge();
    return bridge.dispatch({
      runId: this.options.runId ?? "unavailable",
      runDir: this.options.runDir ?? ".workflow-runs/unavailable",
      nodeId: node.id,
      role: node.role,
      inputKeys: node.inputKeys,
      outputKey: String(node.outputKey),
      outputSchema: node.outputSchema,
      contextPacket: input,
      profileId: this.options.profileId,
    });
  }

  async complete(
    handle: SubAgentDispatchHandle,
    output: unknown,
    context: WorkflowContext,
  ): Promise<SubAgentArtifactRecord> {
    const llmCall = latestLlmCallForNode(context, handle.metadata.nodeId);
    const metadata: SubAgentDispatchMetadata = {
      ...handle.metadata,
      ...llmMetadata(handle.metadata.executorType, llmCall),
      completedAt: new Date().toISOString(),
    };
    return this.store.complete({
      metadata,
      output,
      summary: buildSummary(metadata, output),
    });
  }

  async fail(handle: SubAgentDispatchHandle, error: string, context: WorkflowContext): Promise<SubAgentArtifactRecord> {
    const llmCall = latestLlmCallForNode(context, handle.metadata.nodeId);
    const metadata: SubAgentDispatchMetadata = {
      ...handle.metadata,
      ...llmMetadata(handle.metadata.executorType, llmCall, "failed"),
      completedAt: new Date().toISOString(),
    };
    return this.store.complete({
      metadata,
      output: { error },
      summary: [
        `# ${metadata.role} ${metadata.subAgentId}`,
        "",
        `- status: failed`,
        `- executorType: ${metadata.executorType}`,
        `- error: ${error}`,
      ].join("\n"),
    });
  }
}

function latestLlmCallForNode(context: WorkflowContext, nodeId: string): Record<string, unknown> | undefined {
  return [...(context.runtimeMetadata?.llmCalls ?? [])]
    .reverse()
    .find((item) => item.nodeId === nodeId);
}

function llmMetadata(
  executorType: SubAgentDispatchMetadata["executorType"],
  llmCall: Record<string, unknown> | undefined,
  fallbackStatus?: "failed",
): Pick<SubAgentDispatchMetadata, "modelProvider" | "modelName" | "callStatus" | "isLLMBacked"> {
  if (executorType !== "llm") return { isLLMBacked: false, callStatus: "not_applicable" };
  if (!llmCall) return { isLLMBacked: false, ...(fallbackStatus ? { callStatus: fallbackStatus } : {}) };
  const provider = typeof llmCall.provider === "string" ? llmCall.provider : undefined;
  const model = typeof llmCall.model === "string" ? llmCall.model : undefined;
  const callStatus = llmCall.callStatus === "completed" || llmCall.callStatus === "failed" || llmCall.callStatus === "not_applicable"
    ? llmCall.callStatus
    : "not_applicable";
  const completed = llmCall.callStatus === "completed" && llmCall.success !== false;
  if (!completed || !provider || provider === "mock" || model === "mock-structured") {
    return {
      isLLMBacked: false,
      ...(provider ? { modelProvider: provider } : {}),
      ...(model ? { modelName: model } : {}),
      callStatus: completed ? "not_applicable" : callStatus,
    };
  }
  return {
    isLLMBacked: true,
    modelProvider: provider,
    ...(model ? { modelName: model } : {}),
    callStatus: llmCall.success === false ? "failed" : "completed",
  };
}

function buildSummary(metadata: SubAgentDispatchMetadata, output: unknown): string {
  return [
    `# ${metadata.role} ${metadata.subAgentId}`,
    "",
    `- workerSessionId: ${metadata.workerSessionId}`,
    `- nodeId: ${metadata.nodeId}`,
    `- executorType: ${metadata.executorType}`,
    `- isMock: ${metadata.isMock}`,
    `- isLLMBacked: ${metadata.isLLMBacked}`,
    `- callStatus: ${metadata.callStatus ?? "n/a"}`,
    `- dispatchMode: ${metadata.dispatchMode ?? "internal"}`,
    `- openCodeNativeSubAgent: ${metadata.openCodeNativeSubAgent === true}`,
    `- openCodeAgentName: ${metadata.openCodeAgentName ?? "n/a"}`,
    `- nativeDispatchStatus: ${metadata.nativeDispatchStatus ?? "n/a"}`,
    ...(metadata.nativeDispatchLimitations?.length ? [`- nativeDispatchLimitations: ${metadata.nativeDispatchLimitations.join(" | ")}`] : []),
    `- outputKey: ${String(metadata.outputKey)}`,
    `- outputSchema: ${metadata.outputSchema ?? "n/a"}`,
    "",
    "## Output Preview",
    "",
    preview(output),
  ].join("\n");
}

function nativeMetadata(dispatch: OpenCodeSubAgentDispatchResult | undefined): Partial<SubAgentDispatchMetadata> {
  if (!dispatch) {
    return {
      openCodeNativeSubAgent: false,
      nativeDispatchStatus: undefined,
    };
  }
  return {
    openCodeNativeSubAgent: dispatch.status === "dispatched" || dispatch.status === "completed",
    openCodeAgentName: dispatch.openCodeAgentName,
    ...(dispatch.openCodeTaskId ? { openCodeTaskId: dispatch.openCodeTaskId } : {}),
    ...(dispatch.openCodeSessionId ? { openCodeSessionId: dispatch.openCodeSessionId } : {}),
    nativeDispatchStatus: dispatch.status,
    nativeDispatchLimitations: dispatch.limitations,
    openCodeNativeDispatch: dispatch,
  };
}

function preview(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 500);
  return JSON.stringify(value, null, 2).slice(0, 500);
}
