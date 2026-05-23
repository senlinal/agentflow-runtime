import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LLMClientFactory } from "../core/LLMClientFactory.ts";
import { LLMConfigLoader } from "../core/LLMConfigLoader.ts";
import { MockLLMClient } from "../core/MockLLMClient.ts";
import { OpenAICompatibleLLMClient } from "../core/OpenAICompatibleLLMClient.ts";

describe("LLMConfigLoader and LLMClientFactory", () => {
  it("defaults to mock provider", () => {
    const config = LLMConfigLoader.fromEnv({});
    assert.equal(config.provider, "mock");
    assert.equal(config.timeoutMs, 60_000);
    assert.equal(config.maxRetries, 2);
    assert.ok(LLMClientFactory.fromConfig(config) instanceof MockLLMClient);
  });

  it("loads openai-compatible provider without exposing api key", () => {
    const config = LLMConfigLoader.fromEnv({
      AGENTFLOW_LLM_PROVIDER: "openai-compatible",
      AGENTFLOW_LLM_API_KEY: "secret-key",
      AGENTFLOW_LLM_BASE_URL: "https://example.test/v1",
      AGENTFLOW_LLM_MODEL: "model",
      AGENTFLOW_LLM_TIMEOUT_MS: "1234",
      AGENTFLOW_LLM_MAX_RETRIES: "3",
    });

    assert.equal(config.provider, "openai-compatible");
    assert.equal(config.timeoutMs, 1234);
    assert.equal(config.maxRetries, 3);
    assert.ok(LLMClientFactory.fromConfig(config) instanceof OpenAICompatibleLLMClient);
  });

  it("fails clearly when openai-compatible config is incomplete", () => {
    assert.throws(
      () => LLMConfigLoader.fromEnv({ AGENTFLOW_LLM_PROVIDER: "openai-compatible" }),
      /AGENTFLOW_LLM_API_KEY is required/,
    );
  });

  it("loads deepseek provider with default base URL and dedicated env vars", () => {
    const config = LLMConfigLoader.fromEnv({
      AGENTFLOW_LLM_PROVIDER: "deepseek",
      AGENTFLOW_DEEPSEEK_API_KEY: "deepseek-secret",
    });

    assert.equal(config.provider, "deepseek");
    assert.equal(config.baseUrl, "https://api.deepseek.com");
    assert.equal(config.model, "deepseek-v4-flash");
    assert.deepEqual(config.warnings, []);
    assert.deepEqual(config.deepSeekReasoning, { enabled: false, effort: undefined });
    assert.ok(LLMClientFactory.fromConfig(config) instanceof OpenAICompatibleLLMClient);
  });

  it("loads deepseek provider from DEEPSEEK_API_KEY and allows base URL override", () => {
    const config = LLMConfigLoader.fromEnv({
      AGENTFLOW_LLM_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "deepseek-secret",
      AGENTFLOW_DEEPSEEK_MODEL: "deepseek-reasoner",
      AGENTFLOW_DEEPSEEK_BASE_URL: "https://custom.deepseek.test",
    });

    assert.equal(config.apiKey, "deepseek-secret");
    assert.equal(config.baseUrl, "https://custom.deepseek.test");
    assert.equal(config.model, "deepseek-reasoner");
    assert.equal(config.deepSeekReasoning?.enabled, true);
    assert.match(config.warnings[0], /legacy/);
  });

  it("fails clearly when deepseek key is missing", () => {
    assert.throws(
      () => LLMConfigLoader.fromEnv({
        AGENTFLOW_LLM_PROVIDER: "deepseek",
        AGENTFLOW_DEEPSEEK_MODEL: "deepseek-chat",
      }),
      /AGENTFLOW_DEEPSEEK_API_KEY or DEEPSEEK_API_KEY is required/,
    );
  });

  it("supports explicit deepseek reasoning controls", () => {
    const config = LLMConfigLoader.fromEnv({
      AGENTFLOW_LLM_PROVIDER: "deepseek",
      AGENTFLOW_DEEPSEEK_API_KEY: "deepseek-secret",
      AGENTFLOW_DEEPSEEK_MODEL: "deepseek-v4-pro",
      AGENTFLOW_DEEPSEEK_REASONING_ENABLED: "true",
      AGENTFLOW_DEEPSEEK_REASONING_EFFORT: "high",
    });

    assert.deepEqual(config.deepSeekReasoning, { enabled: true, effort: "high" });
  });

  it("rejects unknown providers", () => {
    assert.throws(() => LLMConfigLoader.fromEnv({ AGENTFLOW_LLM_PROVIDER: "bad" }), /Unsupported LLM provider/);
  });
});
