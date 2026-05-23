import type { LLMClient } from "./LLMClient.ts";
import type { LLMConfig } from "./LLMConfigLoader.ts";
import { LLMConfigLoader } from "./LLMConfigLoader.ts";
import { MockLLMClient } from "./MockLLMClient.ts";
import { OpenAICompatibleLLMClient } from "./OpenAICompatibleLLMClient.ts";

export class LLMClientFactory {
  static fromEnv(env: Record<string, string | undefined> = process.env): LLMClient {
    return LLMClientFactory.fromConfig(LLMConfigLoader.fromEnv(env));
  }

  static fromConfig(config: LLMConfig): LLMClient {
    switch (config.provider) {
      case "mock":
        return new MockLLMClient();
      case "openai-compatible":
      case "deepseek":
        return new OpenAICompatibleLLMClient({
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.model ?? "",
          provider: config.provider,
          timeoutMs: config.timeoutMs,
          warnings: config.warnings,
          providerOptions: config.provider === "deepseek"
            ? {
              responseFormat: { type: "json_object" },
              thinking: config.deepSeekReasoning ? { enabled: config.deepSeekReasoning.enabled } : undefined,
              reasoningEffort: config.deepSeekReasoning?.effort,
            }
            : undefined,
        });
      default:
        throw new Error(`Unsupported LLM provider: ${(config as { provider?: string }).provider}`);
    }
  }
}
