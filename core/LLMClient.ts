import type { AgentRole, OutputSchemaName, WorkflowContext } from "./types.ts";

export type LLMRetryPolicy = {
  maxAttempts: number;
  backoffMs?: number;
};

export type LLMStructuredRequest = {
  role: AgentRole;
  systemPrompt: string;
  userPrompt?: string;
  input: Record<string, unknown>;
  outputSchemaName: OutputSchemaName;
  outputSchema?: unknown;
  retryPolicy?: LLMRetryPolicy;
  metadata?: Record<string, unknown>;
  context?: WorkflowContext;
};

export type LLMUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type LLMStructuredResponse<T> = {
  output: T;
  rawText?: string;
  provider: string;
  model?: string;
  attempts: number;
  usage?: LLMUsage;
};

export interface LLMClient {
  generateStructured<T>(request: LLMStructuredRequest): Promise<LLMStructuredResponse<T>>;
}
