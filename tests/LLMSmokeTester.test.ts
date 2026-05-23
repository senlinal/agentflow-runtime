import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LLMClient, LLMStructuredRequest, LLMStructuredResponse } from "../core/LLMClient.ts";
import { LLMConfigLoader } from "../core/LLMConfigLoader.ts";
import { LLMSmokeTester } from "../core/LLMSmokeTester.ts";
import type { SmokeTestResult } from "../core/types.ts";

describe("LLMSmokeTester", () => {
  it("dry-run does not call the client", async () => {
    let called = false;
    const report = await new LLMSmokeTester().run({
      execute: false,
      config: LLMConfigLoader.fromEnv({ AGENTFLOW_LLM_PROVIDER: "deepseek" }, { validateCredentials: false }),
      client: {
        async generateStructured() {
          called = true;
          throw new Error("should not be called");
        },
      },
    });

    assert.equal(called, false);
    assert.equal(report.mode, "dry-run");
    assert.equal(report.wouldExecute, false);
    assert.equal(report.success, true);
  });

  it("execute=true calls the provided client and returns SmokeTestResult", async () => {
    let called = false;
    const fakeClient: LLMClient = {
      async generateStructured<T>(
        request: LLMStructuredRequest,
      ): Promise<LLMStructuredResponse<T>> {
        called = true;
        assert.equal(request.outputSchemaName, "SmokeTestResult");
        return {
          output: {
            ok: true,
            provider: "fake",
            model: "fake-model",
            message: "ok",
          } as T,
          provider: "fake",
          model: "fake-model",
          attempts: 1,
        };
      },
    };

    const report = await new LLMSmokeTester().run({
      execute: true,
      config: LLMConfigLoader.fromEnv({ AGENTFLOW_LLM_PROVIDER: "mock" }),
      client: fakeClient,
    });

    assert.equal(called, true);
    assert.equal(report.mode, "execute");
    assert.equal(report.result?.ok, true);
    assert.equal(report.attempts, 1);
  });

  it("execute=true fails when client returns schema-invalid output", async () => {
    const fakeClient: LLMClient = {
      async generateStructured<T>(): Promise<LLMStructuredResponse<T>> {
        return {
          output: {
            ok: "yes",
            provider: "fake",
            model: "fake-model",
            message: "bad",
          } as T,
          provider: "fake",
          model: "fake-model",
          attempts: 1,
        };
      },
    };

    await assert.rejects(
      () =>
        new LLMSmokeTester().run({
          execute: true,
          config: LLMConfigLoader.fromEnv({ AGENTFLOW_LLM_PROVIDER: "mock" }),
          client: fakeClient,
        }),
      /SmokeTestResult\.ok must be a boolean/,
    );
  });

  it("missing real provider key fails without leaking provided secret names or values", async () => {
    await assert.rejects(
      () =>
        new LLMSmokeTester().run({
          execute: true,
          env: {
            AGENTFLOW_LLM_PROVIDER: "deepseek",
          },
        }),
      (error) => {
        const message = error instanceof Error ? error.message : String(error);
        assert.match(message, /API_KEY/);
        assert.equal(message.includes("sk-"), false);
        return true;
      },
    );
  });

  it("provider=mock execute succeeds without network", async () => {
    const report = await new LLMSmokeTester().run({
      execute: true,
      env: {
        AGENTFLOW_LLM_PROVIDER: "mock",
      },
    });

    assert.equal(report.success, true);
    assert.equal((report.result as SmokeTestResult).provider, "mock");
  });
});
