import type { LLMConfig } from "./LLMConfigLoader.ts";

export type LLMConfigSummary = {
  provider: string;
  model: string | null;
  baseURL: string | null;
  baseUrl: string | null;
  hasApiKey: boolean;
  timeoutMs: number;
  maxRetries: number;
  reasoning: {
    enabled: boolean;
    effort: string | null;
  } | null;
  warnings: string[];
};

export class LLMConfigReporter {
  static summarize(config: LLMConfig): LLMConfigSummary {
    return {
      provider: config.provider,
      model: config.model ?? null,
      baseURL: config.baseUrl ?? null,
      baseUrl: config.baseUrl ?? null,
      hasApiKey: Boolean(config.apiKey),
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
      reasoning: config.deepSeekReasoning
        ? {
          enabled: config.deepSeekReasoning.enabled,
          effort: config.deepSeekReasoning.effort ?? null,
        }
        : null,
      warnings: [...config.warnings],
    };
  }

  static formatText(summary: LLMConfigSummary): string {
    return [
      `provider: ${summary.provider}`,
      `model: ${summary.model ?? "n/a"}`,
      `baseURL: ${summary.baseURL ?? "n/a"}`,
      `baseUrl: ${summary.baseUrl ?? "n/a"}`,
      `hasApiKey: ${summary.hasApiKey}`,
      summary.reasoning
        ? `reasoning: enabled=${summary.reasoning.enabled} effort=${summary.reasoning.effort ?? "n/a"}`
        : "reasoning: n/a",
      `timeoutMs: ${summary.timeoutMs}`,
      `maxRetries: ${summary.maxRetries}`,
      summary.warnings.length > 0 ? `warnings: ${summary.warnings.join("; ")}` : "warnings: none",
    ].join("\n");
  }
}
