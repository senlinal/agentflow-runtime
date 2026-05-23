import type { LLMConfig } from "./LLMConfigLoader.ts";

export type LLMConfigSummary = {
  provider: string;
  model: string | null;
  baseURL: string | null;
  hasApiKey: boolean;
  timeoutMs: number;
  maxRetries: number;
  warnings: string[];
};

export class LLMConfigReporter {
  static summarize(config: LLMConfig): LLMConfigSummary {
    return {
      provider: config.provider,
      model: config.model ?? null,
      baseURL: config.baseUrl ?? null,
      hasApiKey: Boolean(config.apiKey),
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
      warnings: [...config.warnings],
    };
  }

  static formatText(summary: LLMConfigSummary): string {
    return [
      `provider: ${summary.provider}`,
      `model: ${summary.model ?? "n/a"}`,
      `baseURL: ${summary.baseURL ?? "n/a"}`,
      `hasApiKey: ${summary.hasApiKey}`,
      `timeoutMs: ${summary.timeoutMs}`,
      `maxRetries: ${summary.maxRetries}`,
      summary.warnings.length > 0 ? `warnings: ${summary.warnings.join("; ")}` : "warnings: none",
    ].join("\n");
  }
}
