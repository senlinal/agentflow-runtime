import { readFile } from "node:fs/promises";
import type { AgentRole, NodeType, OutputSchemaName, WorkflowContext, WorkflowTrace } from "../types.ts";

export type RuntimeVerifiedRoleEvent = {
  workflow?: string;
  nodeId: string;
  role: AgentRole;
  nodeType: NodeType | "unknown";
  executorType: NodeType | "unknown";
  type: NodeType | "unknown";
  status: "completed" | "failed" | "blocked" | "skipped";
  outputKey?: keyof WorkflowContext;
  outputSchema?: OutputSchemaName;
  summary?: string;
  nextNode?: string;
  step?: number;
  timestamp?: string;
  source: "runtime_trace" | "subagent_dispatch_trace";
  isMock: boolean;
  isLLMBacked: boolean;
  subAgentDispatched?: boolean;
  subAgentId?: string;
  workerSessionId?: string;
  modelProvider?: string;
  modelName?: string;
  callStatus?: "completed" | "failed" | "not_applicable";
  inputArtifactPath?: string;
  outputArtifactPath?: string;
  subAgentMetadataPath?: string;
  deliverableType?: string;
  deliverablePreview?: string;
  attemptNumber?: number;
  routeId?: string;
  attemptDecision?: string;
  retryReason?: string;
  stopReason?: string;
  answersUserRequest?: boolean;
  isNotMetaOnly?: boolean;
  pass?: boolean;
};

export type RuntimeProof = {
  runtimeStarted: boolean;
  tracePath?: string;
  contextPath?: string;
  verifiedRoleCount: number;
  roleSource: "runtime_trace" | "subagent_dispatch_trace" | "unavailable";
};

export class RuntimeTraceRoleExtractor {
  async extractFromTraceFile(tracePath: string, options: { workflow?: string } = {}): Promise<RuntimeVerifiedRoleEvent[]> {
    let raw: string;
    try {
      raw = await readFile(tracePath, "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`AgentFlow Runtime trace was not found: ${tracePath}. ${message}`);
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`AgentFlow Runtime trace must be an array: ${tracePath}`);
    }
    return this.extractFromTrace(parsed, options);
  }

  extractFromTrace(trace: unknown[], options: { workflow?: string } = {}): RuntimeVerifiedRoleEvent[] {
    return trace
      .filter(isTraceLike)
      .map((item) => {
        const executorType = item.nodeType ?? "unknown";
        return {
          ...(options.workflow ? { workflow: options.workflow } : {}),
          nodeId: item.nodeId,
          role: item.role,
          nodeType: executorType,
          executorType,
          type: executorType,
          status: item.error ? "failed" : "completed",
          outputKey: item.outputKey,
          outputSchema: item.outputSchema,
          summary: item.error ?? item.outputSummary,
          nextNode: item.nextNode,
          step: item.step,
          timestamp: item.timestamp,
          source: item.subAgentDispatched ? "subagent_dispatch_trace" as const : "runtime_trace" as const,
          isMock: executorType === "mock",
          isLLMBacked: item.isLLMBacked === true,
          subAgentDispatched: item.subAgentDispatched,
          subAgentId: item.subAgentId,
          workerSessionId: item.workerSessionId,
          modelProvider: item.modelProvider,
          modelName: item.modelName,
          callStatus: item.callStatus,
          inputArtifactPath: item.inputArtifactPath,
          outputArtifactPath: item.outputArtifactPath,
          subAgentMetadataPath: item.subAgentMetadataPath,
          deliverableType: item.deliverableType,
          deliverablePreview: item.deliverablePreview,
          attemptNumber: item.attemptNumber,
          routeId: item.routeId,
          attemptDecision: item.attemptDecision,
          retryReason: item.retryReason,
          stopReason: item.stopReason,
          answersUserRequest: item.answersUserRequest,
          isNotMetaOnly: item.isNotMetaOnly,
          pass: item.pass,
        };
      });
  }
}

function isTraceLike(value: unknown): value is WorkflowTrace {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.nodeId === "string" && typeof record.role === "string";
}
