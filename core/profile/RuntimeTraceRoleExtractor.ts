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
  source: "runtime_trace";
  isMock: boolean;
  isLLMBacked: boolean;
};

export type RuntimeProof = {
  runtimeStarted: boolean;
  tracePath?: string;
  contextPath?: string;
  verifiedRoleCount: number;
  roleSource: "runtime_trace" | "unavailable";
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
          source: "runtime_trace" as const,
          isMock: executorType === "mock",
          isLLMBacked: executorType === "llm",
        };
      });
  }
}

function isTraceLike(value: unknown): value is WorkflowTrace {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.nodeId === "string" && typeof record.role === "string";
}
