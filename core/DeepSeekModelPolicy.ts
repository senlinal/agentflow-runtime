export type DeepSeekReasoningOptions = {
  enabled: boolean;
  effort?: string;
};

export const RECOMMENDED_DEEPSEEK_MODELS = ["deepseek-v4-flash", "deepseek-v4-pro"] as const;
export const LEGACY_DEEPSEEK_MODELS = ["deepseek-chat", "deepseek-reasoner"] as const;

export function getDefaultDeepSeekModel(): string {
  return "deepseek-v4-flash";
}

export function isRecommendedDeepSeekModel(model: string): boolean {
  return RECOMMENDED_DEEPSEEK_MODELS.includes(model as (typeof RECOMMENDED_DEEPSEEK_MODELS)[number]);
}

export function isLegacyDeepSeekModel(model: string): boolean {
  return LEGACY_DEEPSEEK_MODELS.includes(model as (typeof LEGACY_DEEPSEEK_MODELS)[number]);
}

export function getDeepSeekModelWarnings(model: string): string[] {
  if (isRecommendedDeepSeekModel(model)) return [];
  if (model === "deepseek-chat") {
    return ["DeepSeek model deepseek-chat is legacy; prefer deepseek-v4-flash for low-cost structured workflows."];
  }
  if (model === "deepseek-reasoner") {
    return ["DeepSeek model deepseek-reasoner is legacy; prefer deepseek-v4-pro for reasoning-heavy structured workflows."];
  }
  return [`Unknown DeepSeek model: ${model}. Confirm the model name before live workflow execution.`];
}

export function inferDeepSeekReasoningOptions(
  model: string,
  envConfig: Record<string, string | undefined> = {},
): DeepSeekReasoningOptions {
  const explicitEnabled = parseBoolean(envConfig.AGENTFLOW_DEEPSEEK_REASONING_ENABLED);
  const defaultEnabled = model === "deepseek-reasoner";
  const enabled = explicitEnabled ?? defaultEnabled;
  return {
    enabled,
    effort: enabled ? envConfig.AGENTFLOW_DEEPSEEK_REASONING_EFFORT : undefined,
  };
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  throw new Error("AGENTFLOW_DEEPSEEK_REASONING_ENABLED must be a boolean.");
}
