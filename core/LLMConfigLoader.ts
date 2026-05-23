import {
  getDeepSeekModelWarnings,
  getDefaultDeepSeekModel,
  inferDeepSeekReasoningOptions,
  type DeepSeekReasoningOptions,
} from "./DeepSeekModelPolicy.ts";

export type LLMProviderName = "mock" | "openai-compatible" | "deepseek";

export type LLMConfig = {
  provider: LLMProviderName;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
  maxRetries: number;
  warnings: string[];
  deepSeekReasoning?: DeepSeekReasoningOptions;
};

export type LLMConfigLoaderOptions = {
  validateCredentials?: boolean;
};

export class LLMConfigLoader {
  static fromEnv(
    env: Record<string, string | undefined> = process.env,
    options: LLMConfigLoaderOptions = {},
  ): LLMConfig {
    const validateCredentials = options.validateCredentials ?? true;
    const provider = env.AGENTFLOW_LLM_PROVIDER ?? "mock";
    if (provider !== "mock" && provider !== "openai-compatible" && provider !== "deepseek") {
      throw new Error(`Unsupported LLM provider: ${provider}`);
    }

    const config: LLMConfig = {
      provider,
      baseUrl: resolveBaseUrl(provider, env),
      apiKey: resolveApiKey(provider, env),
      model: resolveModel(provider, env),
      timeoutMs: positiveInteger(env.AGENTFLOW_LLM_TIMEOUT_MS, 60_000, "AGENTFLOW_LLM_TIMEOUT_MS"),
      maxRetries: positiveInteger(env.AGENTFLOW_LLM_MAX_RETRIES, 2, "AGENTFLOW_LLM_MAX_RETRIES"),
      warnings: [],
    };

    if (provider === "openai-compatible" && validateCredentials) {
      if (!config.apiKey) throw new Error("AGENTFLOW_LLM_API_KEY is required for provider=openai-compatible.");
      if (!config.baseUrl) throw new Error("AGENTFLOW_LLM_BASE_URL is required for provider=openai-compatible.");
      if (!config.model) throw new Error("AGENTFLOW_LLM_MODEL is required for provider=openai-compatible.");
    }
    if (provider === "deepseek") {
      config.model = config.model ?? getDefaultDeepSeekModel();
      config.warnings = getDeepSeekModelWarnings(config.model);
      config.deepSeekReasoning = inferDeepSeekReasoningOptions(config.model, env);
    }
    if (provider === "deepseek" && validateCredentials) {
      if (!config.apiKey) {
        throw new Error("AGENTFLOW_DEEPSEEK_API_KEY or DEEPSEEK_API_KEY is required for provider=deepseek.");
      }
    }

    return config;
  }
}

function resolveBaseUrl(provider: LLMProviderName, env: Record<string, string | undefined>): string | undefined {
  if (provider === "deepseek") {
    return env.AGENTFLOW_DEEPSEEK_BASE_URL ?? env.AGENTFLOW_LLM_BASE_URL ?? "https://api.deepseek.com";
  }
  return env.AGENTFLOW_LLM_BASE_URL ?? env.OPENAI_BASE_URL;
}

function resolveApiKey(provider: LLMProviderName, env: Record<string, string | undefined>): string | undefined {
  if (provider === "deepseek") {
    return env.AGENTFLOW_DEEPSEEK_API_KEY ?? env.DEEPSEEK_API_KEY ?? env.AGENTFLOW_LLM_API_KEY;
  }
  return env.AGENTFLOW_LLM_API_KEY ?? env.OPENAI_API_KEY;
}

function resolveModel(provider: LLMProviderName, env: Record<string, string | undefined>): string | undefined {
  if (provider === "deepseek") {
    return env.AGENTFLOW_DEEPSEEK_MODEL ?? env.AGENTFLOW_LLM_MODEL ?? getDefaultDeepSeekModel();
  }
  return env.AGENTFLOW_LLM_MODEL ?? env.OPENAI_MODEL;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}
