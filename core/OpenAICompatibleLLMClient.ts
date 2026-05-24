import type { LLMClient, LLMStructuredRequest, LLMStructuredResponse, LLMUsage } from "./LLMClient.ts";
import { SchemaValidator } from "./SchemaValidator.ts";
import { redactSecrets } from "./SecretRedactor.ts";
import { StructuredOutputRepairer } from "./StructuredOutputRepairer.ts";
import { StructuredOutputParser } from "./StructuredOutputParser.ts";

export type OpenAICompatibleLLMClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  provider?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  providerOptions?: OpenAICompatibleProviderOptions;
  warnings?: string[];
};

export type OpenAICompatibleProviderOptions = {
  responseFormat?: { type: "json_object" };
  thinking?: { type: "enabled" | "disabled" } | { enabled: boolean };
  reasoningEffort?: string;
};

export class OpenAICompatibleLLMClient implements LLMClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly provider: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly providerOptions: OpenAICompatibleProviderOptions;
  private readonly warnings: string[];

  constructor(options: OpenAICompatibleLLMClientOptions) {
    if (!options.model) throw new Error("OpenAICompatibleLLMClient requires a model.");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    this.model = options.model;
    this.provider = options.provider ?? "openai-compatible";
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.fetchFn = options.fetchFn ?? fetch;
    this.providerOptions = options.providerOptions ?? {};
    this.warnings = options.warnings ?? [];
  }

  async generateStructured<T>(request: LLMStructuredRequest): Promise<LLMStructuredResponse<T>> {
    const maxAttempts = Math.max(1, request.retryPolicy?.maxAttempts ?? 2);
    let lastError: Error | null = null;
    let rawText = "";
    let usage: LLMUsage | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await this.callChatCompletion(request, attempt, lastError?.message, rawText);
        rawText = response.rawText;
        usage = response.usage;
        const parsed = StructuredOutputParser.parseJsonObject(rawText);
        const output = SchemaValidator.validate(request.outputSchemaName, parsed) as T;
        return {
          output,
          rawText,
          provider: this.provider,
          model: this.model,
          attempts: attempt,
          usage,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxAttempts && request.retryPolicy?.backoffMs) {
          await sleep(request.retryPolicy.backoffMs);
        }
      }
    }

    throw new Error(
      `LLM structured generation failed after ${maxAttempts} attempt(s) for ${request.role}/${request.outputSchemaName}: ${
        sanitizeError(lastError?.message ?? "unknown error")
      }`,
    );
  }

  private async callChatCompletion(
    request: LLMStructuredRequest,
    attempt: number,
    priorError?: string,
    priorRawOutput?: string,
  ): Promise<{ rawText: string; usage?: LLMUsage }> {
    if (!this.apiKey) {
      throw new Error("Missing LLM API key. Set AGENTFLOW_LLM_API_KEY or OPENAI_API_KEY before using llm nodes.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          response_format: this.providerOptions.responseFormat ?? { type: "json_object" },
          ...optionalBody(this.providerOptions),
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: buildUserContent(request, attempt, priorError, priorRawOutput) },
          ],
        }),
        signal: controller.signal,
      });

      const body = await response.text();
      if (!response.ok) {
        throw new Error(`Provider returned HTTP ${response.status}: ${sanitizeProviderBody(body)}`);
      }

      const parsed = JSON.parse(body) as Record<string, unknown>;
      const rawText = extractAssistantText(parsed);
      return { rawText, usage: extractUsage(parsed.usage) };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Provider request timed out after ${this.timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildUserContent(
  request: LLMStructuredRequest,
  attempt: number,
  priorError?: string,
  priorRawOutput?: string,
): string {
  if (attempt > 1 && priorError) {
    return StructuredOutputRepairer.buildRepairPrompt({
      outputSchemaName: request.outputSchemaName,
      error: priorError,
      rawOutput: priorRawOutput ?? "",
    });
  }
  const lines = [
    request.userPrompt ?? "Generate the requested structured output from the provided input.",
  ];
  if (request.metadata) {
    lines.push("", `Metadata JSON: ${JSON.stringify(request.metadata)}`);
  }
  return lines.join("\n");
}

function extractAssistantText(body: Record<string, unknown>): string {
  const choices = body.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("Provider response missing choices.");
  }
  const first = choices[0] as Record<string, unknown>;
  const message = first.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof message?.reasoning_content === "string" && typeof content !== "string") {
    throw new Error("Provider response contained reasoning_content but no assistant JSON content.");
  }
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Provider response missing assistant JSON content.");
  }
  return content;
}

function optionalBody(options: OpenAICompatibleProviderOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (options.thinking) body.thinking = normalizeThinking(options.thinking);
  if (options.reasoningEffort) body.reasoning_effort = options.reasoningEffort;
  return body;
}

function normalizeThinking(thinking: NonNullable<OpenAICompatibleProviderOptions["thinking"]>): { type: "enabled" | "disabled" } {
  if ("type" in thinking) return thinking;
  return { type: thinking.enabled ? "enabled" : "disabled" };
}

function extractUsage(value: unknown): LLMUsage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return {
    inputTokens: numberValue(record.prompt_tokens ?? record.input_tokens),
    outputTokens: numberValue(record.completion_tokens ?? record.output_tokens),
    totalTokens: numberValue(record.total_tokens),
  };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sanitizeProviderBody(value: string): string {
  return sanitizeError(value).slice(0, 500);
}

function sanitizeError(value: string): string {
  return redactSecrets(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
