import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LLMConfigLoader } from "../core/LLMConfigLoader.ts";
import { LLMConfigReporter } from "../core/LLMConfigReporter.ts";

describe("LLMConfigReporter", () => {
  it("returns sanitized config summary without apiKey", () => {
    const config = LLMConfigLoader.fromEnv({
      AGENTFLOW_LLM_PROVIDER: "deepseek",
      AGENTFLOW_DEEPSEEK_API_KEY: "sk-secret-value",
      AGENTFLOW_DEEPSEEK_MODEL: "deepseek-v4-flash",
    });
    const summary = LLMConfigReporter.summarize(config);

    assert.equal(summary.provider, "deepseek");
    assert.equal(summary.model, "deepseek-v4-flash");
    assert.equal(summary.baseURL, "https://api.deepseek.com");
    assert.equal(summary.baseUrl, "https://api.deepseek.com");
    assert.equal(summary.hasApiKey, true);
    assert.deepEqual(summary.reasoning, { enabled: false, effort: null });
    assert.equal(JSON.stringify(summary).includes("sk-secret-value"), false);
  });

  it("reports missing apiKey as false during dry-run config loading", () => {
    const config = LLMConfigLoader.fromEnv({
      AGENTFLOW_LLM_PROVIDER: "deepseek",
    }, { validateCredentials: false });
    const summary = LLMConfigReporter.summarize(config);

    assert.equal(summary.hasApiKey, false);
    assert.equal(summary.model, "deepseek-v4-flash");
  });

  it("surfaces legacy model warnings", () => {
    const config = LLMConfigLoader.fromEnv({
      AGENTFLOW_LLM_PROVIDER: "deepseek",
      AGENTFLOW_DEEPSEEK_MODEL: "deepseek-chat",
    }, { validateCredentials: false });
    const summary = LLMConfigReporter.summarize(config);

    assert.equal(summary.warnings.length > 0, true);
    assert.match(summary.warnings[0], /legacy/);
  });

  it("formats text without secrets", () => {
    const config = LLMConfigLoader.fromEnv({
      AGENTFLOW_LLM_PROVIDER: "deepseek",
      AGENTFLOW_DEEPSEEK_API_KEY: "sk-secret-value",
    });
    const text = LLMConfigReporter.formatText(LLMConfigReporter.summarize(config));

    assert.equal(text.includes("sk-secret-value"), false);
    assert.match(text, /hasApiKey: true/);
    assert.match(text, /reasoning: enabled=false effort=n\/a/);
  });
});
