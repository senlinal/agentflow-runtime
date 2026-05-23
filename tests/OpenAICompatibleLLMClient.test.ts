import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OpenAICompatibleLLMClient } from "../core/OpenAICompatibleLLMClient.ts";

describe("OpenAICompatibleLLMClient", () => {
  it("returns validated structured output from an OpenAI-compatible response", async () => {
    const client = new OpenAICompatibleLLMClient({
      apiKey: "test-key",
      model: "test-model",
      fetchFn: fakeFetch([
        providerResponse(JSON.stringify(validVerification())),
      ]),
    });

    const response = await client.generateStructured<any>({
      role: "Verifier",
      systemPrompt: "verify",
      input: {},
      outputSchemaName: "VerificationReport",
    });

    assert.equal(response.output.pass, true);
    assert.equal(response.provider, "openai-compatible");
    assert.equal(response.model, "test-model");
    assert.equal(response.attempts, 1);
    assert.equal(response.usage?.totalTokens, 12);
  });

  it("retries and repairs invalid JSON output", async () => {
    const client = new OpenAICompatibleLLMClient({
      apiKey: "test-key",
      model: "test-model",
      fetchFn: fakeFetch([
        providerResponse("not-json"),
        providerResponse(JSON.stringify(validVerification())),
      ]),
    });

    const response = await client.generateStructured<any>({
      role: "Verifier",
      systemPrompt: "verify",
      input: {},
      outputSchemaName: "VerificationReport",
      retryPolicy: { maxAttempts: 2 },
    });

    assert.equal(response.output.pass, true);
    assert.equal(response.attempts, 2);
  });

  it("fails clearly when schema validation never passes", async () => {
    const client = new OpenAICompatibleLLMClient({
      apiKey: "test-key",
      model: "test-model",
      fetchFn: fakeFetch([
        providerResponse(JSON.stringify({ pass: "yes" })),
      ]),
    });

    await assert.rejects(
      () => client.generateStructured({
        role: "Verifier",
        systemPrompt: "verify",
        input: {},
        outputSchemaName: "VerificationReport",
        retryPolicy: { maxAttempts: 1 },
      }),
      /VerificationReport\.pass must be a boolean/,
    );
  });

  it("does not expose API keys in provider errors", async () => {
    const client = new OpenAICompatibleLLMClient({
      apiKey: "secret-token-value",
      model: "test-model",
      fetchFn: fakeFetch([
        new Response('{"error":"token=secret-token-value apiKey=secret-token-value"}', { status: 401 }),
      ]),
    });

    await assert.rejects(
      () => client.generateStructured({
        role: "Planner",
        systemPrompt: "plan",
        input: {},
        outputSchemaName: "Plan",
        retryPolicy: { maxAttempts: 1 },
      }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.doesNotMatch(error.message, /secret-token-value/);
        assert.match(error.message, /REDACTED/);
        return true;
      },
    );
  });

  it("fails before fetch when API key is missing", async () => {
    let called = false;
    const client = new OpenAICompatibleLLMClient({
      model: "test-model",
      fetchFn: (async () => {
        called = true;
        return providerResponse(JSON.stringify(validVerification()));
      }) as typeof fetch,
    });

    await assert.rejects(
      () => client.generateStructured({
        role: "Verifier",
        systemPrompt: "verify",
        input: {},
        outputSchemaName: "VerificationReport",
      }),
      /Missing LLM API key/,
    );
    assert.equal(called, false);
  });

  it("sends JSON response_format and DeepSeek reasoning options", async () => {
    let body: any = null;
    const client = new OpenAICompatibleLLMClient({
      apiKey: "test-key",
      model: "deepseek-v4-pro",
      provider: "deepseek",
      providerOptions: {
        responseFormat: { type: "json_object" },
        thinking: { enabled: true },
        reasoningEffort: "high",
      },
      fetchFn: (async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return providerResponse(JSON.stringify(validVerification()));
      }) as typeof fetch,
    });

    await client.generateStructured({
      role: "Verifier",
      systemPrompt: "verify",
      input: {},
      outputSchemaName: "VerificationReport",
    });

    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.deepEqual(body.thinking, { enabled: true });
    assert.equal(body.reasoning_effort, "high");
  });

  it("does not persist DeepSeek reasoning_content as rawText", async () => {
    const client = new OpenAICompatibleLLMClient({
      apiKey: "test-key",
      model: "deepseek-v4-pro",
      provider: "deepseek",
      fetchFn: fakeFetch([
        new Response(JSON.stringify({
          choices: [{
            message: {
              reasoning_content: "private reasoning that should not be persisted",
              content: JSON.stringify(validVerification()),
            },
          }],
        }), { status: 200 }),
      ]),
    });

    const response = await client.generateStructured<any>({
      role: "Verifier",
      systemPrompt: "verify",
      input: {},
      outputSchemaName: "VerificationReport",
    });

    assert.equal(response.output.pass, true);
    assert.doesNotMatch(response.rawText ?? "", /private reasoning/);
  });
});

function validVerification() {
  return {
    pass: true,
    score: 0.9,
    failedCriteria: [],
    reason: "ok",
    nextAction: "end",
    feedbackToPlanner: "done",
  };
}

function providerResponse(content: string): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
  }), { status: 200 });
}

function fakeFetch(responses: Response[]): typeof fetch {
  let index = 0;
  return (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const response = responses[index];
    index += 1;
    if (!response) throw new Error("No fake response queued.");
    return response;
  }) as typeof fetch;
}
