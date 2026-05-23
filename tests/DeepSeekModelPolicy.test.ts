import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getDeepSeekModelWarnings,
  getDefaultDeepSeekModel,
  inferDeepSeekReasoningOptions,
  isLegacyDeepSeekModel,
  isRecommendedDeepSeekModel,
} from "../core/DeepSeekModelPolicy.ts";

describe("DeepSeekModelPolicy", () => {
  it("uses deepseek-v4-flash as the default model", () => {
    assert.equal(getDefaultDeepSeekModel(), "deepseek-v4-flash");
  });

  it("recognizes recommended models", () => {
    assert.equal(isRecommendedDeepSeekModel("deepseek-v4-flash"), true);
    assert.equal(isRecommendedDeepSeekModel("deepseek-v4-pro"), true);
  });

  it("recognizes legacy models and returns warnings", () => {
    assert.equal(isLegacyDeepSeekModel("deepseek-chat"), true);
    assert.equal(isLegacyDeepSeekModel("deepseek-reasoner"), true);
    assert.match(getDeepSeekModelWarnings("deepseek-chat")[0], /legacy/);
    assert.match(getDeepSeekModelWarnings("deepseek-reasoner")[0], /legacy/);
  });

  it("warns for unknown models without blocking", () => {
    assert.match(getDeepSeekModelWarnings("deepseek-custom")[0], /Unknown DeepSeek model/);
  });

  it("infers reasoning options by model and env", () => {
    assert.deepEqual(inferDeepSeekReasoningOptions("deepseek-v4-flash", {}), { enabled: false, effort: undefined });
    assert.deepEqual(inferDeepSeekReasoningOptions("deepseek-reasoner", {}), { enabled: true, effort: undefined });
    assert.deepEqual(
      inferDeepSeekReasoningOptions("deepseek-v4-pro", {
        AGENTFLOW_DEEPSEEK_REASONING_ENABLED: "true",
        AGENTFLOW_DEEPSEEK_REASONING_EFFORT: "medium",
      }),
      { enabled: true, effort: "medium" },
    );
  });
});
