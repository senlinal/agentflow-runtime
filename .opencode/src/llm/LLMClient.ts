import type { WorkflowContext } from "../core/schemas.ts";

export type LLMRequest = {
  nodeId: string;
  role: string;
  description: string;
  systemPrompt: string;
  prompt: string;
  input: Record<string, unknown>;
  outputSchema: string;
  context: WorkflowContext;
};

export interface LLMClient {
  completeStructured(request: LLMRequest): Promise<unknown>;
}
