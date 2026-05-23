import { z } from "zod";
import type { LLMClient } from "../llm/LLMClient.ts";
import type { OutputSchemaName, WorkflowContext } from "./schemas.ts";
import { OutputSchemas } from "./schemas.ts";

export type RetryPolicy = {
  maxAttempts: number;
  backoffMs?: number;
};

export type AgentNodeConfig = {
  id: string;
  role: string;
  description: string;
  systemPrompt: string;
  inputKeys: string[];
  outputKey: keyof WorkflowContext;
  outputSchema: OutputSchemaName;
  retryPolicy?: RetryPolicy;
};

export class AgentNode {
  readonly id: string;
  readonly role: string;
  readonly description: string;
  readonly systemPrompt: string;
  readonly inputKeys: string[];
  readonly outputKey: keyof WorkflowContext;
  readonly outputSchema: OutputSchemaName;
  readonly retryPolicy: RetryPolicy;
  private readonly llm: LLMClient;

  constructor(config: AgentNodeConfig, llm: LLMClient) {
    this.id = config.id;
    this.role = config.role;
    this.description = config.description;
    this.systemPrompt = config.systemPrompt;
    this.inputKeys = config.inputKeys;
    this.outputKey = config.outputKey;
    this.outputSchema = config.outputSchema;
    this.retryPolicy = config.retryPolicy ?? { maxAttempts: 1 };
    this.llm = llm;
  }

  async run(context: WorkflowContext): Promise<WorkflowContext> {
    const input = Object.fromEntries(this.inputKeys.map((key) => [key, readPath(context, key)]));
    const attempts = Math.max(1, this.retryPolicy.maxAttempts);
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const prompt = this.buildPrompt(input);
        const rawOutput = await this.llm.completeStructured({
          nodeId: this.id,
          role: this.role,
          description: this.description,
          systemPrompt: this.systemPrompt,
          prompt,
          input,
          outputSchema: this.outputSchema,
          context,
        });
        const schema = OutputSchemas[this.outputSchema] as z.ZodTypeAny;
        const parsed = schema.parse(rawOutput);
        return {
          ...context,
          [this.outputKey]: parsed,
          history: [
            ...context.history,
            {
              nodeId: this.id,
              role: this.role,
              outputKey: this.outputKey,
              output: parsed,
              timestamp: new Date().toISOString(),
            },
          ],
        };
      } catch (error) {
        lastError = error;
        if (attempt < attempts && this.retryPolicy.backoffMs) {
          await sleep(this.retryPolicy.backoffMs);
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private buildPrompt(input: Record<string, unknown>): string {
    return [
      this.systemPrompt,
      "",
      `Node: ${this.id}`,
      `Role: ${this.role}`,
      `Description: ${this.description}`,
      `Required output schema: ${this.outputSchema}`,
      "Context input:",
      JSON.stringify(input, null, 2),
    ].join("\n");
  }
}

export function readPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, source);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
