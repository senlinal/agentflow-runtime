import type { LLMClient } from "./LLMClient.ts";
import { LLMClientFactory } from "./LLMClientFactory.ts";
import { LLMConfigLoader, type LLMConfig } from "./LLMConfigLoader.ts";
import { LLMConfigReporter, type LLMConfigSummary } from "./LLMConfigReporter.ts";
import { PromptRenderer } from "./PromptRenderer.ts";
import { SchemaValidator } from "./SchemaValidator.ts";
import { redactSecrets } from "./SecretRedactor.ts";
import type { SmokeTestResult } from "./types.ts";

export type LLMSmokeTesterOptions = {
  execute?: boolean;
  env?: Record<string, string | undefined>;
  config?: LLMConfig;
  client?: LLMClient;
  clientFactory?: (config: LLMConfig) => LLMClient;
  promptRenderer?: PromptRenderer;
};

export type LLMSmokeTestReport = {
  mode: "dry-run" | "execute";
  provider: string;
  model: string | null;
  baseURL: string | null;
  hasApiKey: boolean;
  warnings: string[];
  wouldExecute: boolean;
  success: boolean;
  attempts: number;
  result?: SmokeTestResult;
  message: string;
};

export class LLMSmokeTester {
  async run(options: LLMSmokeTesterOptions = {}): Promise<LLMSmokeTestReport> {
    const execute = options.execute ?? false;
    const config = options.config ??
      LLMConfigLoader.fromEnv(options.env ?? process.env, { validateCredentials: execute });
    const summary = LLMConfigReporter.summarize(config);

    if (!execute) {
      return {
        ...summaryFields(summary),
        mode: "dry-run",
        wouldExecute: false,
        success: true,
        attempts: 0,
        message: "Dry-run passed. Pass --execute to call the provider.",
      };
    }

    const client = options.client ?? options.clientFactory?.(config) ?? LLMClientFactory.fromConfig(config);
    const promptRenderer = options.promptRenderer ?? new PromptRenderer();
    const prompt = promptRenderer.render({
      role: "Executor",
      systemPrompt: "You are a provider smoke test responder. Return only valid JSON for the requested schema.",
      input: {
        task: "Return a minimal structured smoke test result.",
        provider: summary.provider,
        model: summary.model,
      },
      outputSchemaName: "SmokeTestResult",
    });

    try {
      const response = await client.generateStructured<SmokeTestResult>({
        role: "Executor",
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        input: {
          task: "Return a minimal structured smoke test result.",
        },
        outputSchemaName: "SmokeTestResult",
        retryPolicy: {
          maxAttempts: config.maxRetries,
          backoffMs: 100,
        },
        metadata: {
          smokeTest: true,
        },
      });
      const result = SchemaValidator.validate("SmokeTestResult", response.output) as SmokeTestResult;
      return {
        ...summaryFields(summary),
        mode: "execute",
        wouldExecute: true,
        success: true,
        attempts: response.attempts,
        result,
        message: "LLM smoke test passed.",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`LLM smoke test failed: ${redactSecrets(message)}`);
    }
  }
}

function summaryFields(summary: LLMConfigSummary) {
  return {
    provider: summary.provider,
    model: summary.model,
    baseURL: summary.baseURL,
    hasApiKey: summary.hasApiKey,
    warnings: summary.warnings,
  };
}
