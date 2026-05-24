import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readPath } from "../context.ts";
import type { AgentNode, SubAgentDispatchMetadata, WorkflowContext } from "../types.ts";
import { SubAgentArtifactStore, type SubAgentArtifactRecord } from "./SubAgentArtifactStore.ts";

export type SubAgentDispatchHandle = {
  metadata: SubAgentDispatchMetadata;
  input: Record<string, unknown>;
};

export class SubAgentDispatcher {
  private readonly store: SubAgentArtifactStore;

  constructor(store: SubAgentArtifactStore) {
    this.store = store;
  }

  async start(node: AgentNode, context: WorkflowContext, step: number): Promise<SubAgentDispatchHandle> {
    const subAgentId = `${node.id}-${step}-${randomUUID().slice(0, 8)}`;
    const workerSessionId = `worker-${node.role.toLowerCase()}-${randomUUID().slice(0, 8)}`;
    const dir = this.store.subAgentDir(subAgentId);
    const input = Object.fromEntries(node.inputKeys.map((key) => [key, readPath(context, key)]));
    const metadata: SubAgentDispatchMetadata = {
      subAgentId,
      workerSessionId,
      nodeId: node.id,
      role: node.role,
      executorType: node.type,
      isMock: node.type === "mock",
      isLLMBacked: node.type === "llm",
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
    };
    await this.store.start({
      metadata,
      input,
      prompt: node.systemPrompt ?? node.description,
    });
    return { metadata, input };
  }

  async complete(
    handle: SubAgentDispatchHandle,
    output: unknown,
    context: WorkflowContext,
  ): Promise<SubAgentArtifactRecord> {
    const llmCall = latestLlmCallForNode(context, handle.metadata.nodeId);
    const metadata: SubAgentDispatchMetadata = {
      ...handle.metadata,
      ...llmMetadata(llmCall),
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
      ...llmMetadata(llmCall, "failed"),
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
  llmCall: Record<string, unknown> | undefined,
  fallbackStatus?: "failed",
): Pick<SubAgentDispatchMetadata, "modelProvider" | "modelName" | "callStatus"> {
  if (!llmCall) return fallbackStatus ? { callStatus: fallbackStatus } : {};
  return {
    ...(typeof llmCall.provider === "string" ? { modelProvider: llmCall.provider } : {}),
    ...(typeof llmCall.model === "string" ? { modelName: llmCall.model } : {}),
    callStatus: llmCall.success === false ? "failed" : "success",
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
    `- outputKey: ${String(metadata.outputKey)}`,
    `- outputSchema: ${metadata.outputSchema ?? "n/a"}`,
    "",
    "## Output Preview",
    "",
    preview(output),
  ].join("\n");
}

function preview(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 500);
  return JSON.stringify(value, null, 2).slice(0, 500);
}
