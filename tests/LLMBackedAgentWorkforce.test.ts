import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { LLMExecutor } from "../core/LLMExecutor.ts";
import type { LLMClient, LLMStructuredRequest, LLMStructuredResponse } from "../core/LLMClient.ts";
import { MockLLMClient } from "../core/MockLLMClient.ts";
import { NodeRegistry } from "../core/NodeRegistry.ts";
import { ProfileWorkflowRunner } from "../core/profile/ProfileWorkflowRunner.ts";
import { ProfileSessionStore } from "../core/profile/ProfileSessionStore.ts";
import { ProjectMemoryStore } from "../core/profile/ProjectMemoryStore.ts";
import { ScopeConfirmationStore } from "../core/scope/ScopeConfirmationStore.ts";
import type { WorkflowContext } from "../core/types.ts";
import { WorkflowRunner } from "../core/WorkflowRunner.ts";

test("LLM-backed agent workforce pilot", async (t) => {
  await t.test("blocks agent-workforce-llm when allowLLM is false", async () => {
    const restore = withDeepSeekEnv({ apiKey: "test-key" });
    try {
      const result = await createRunner().run({
        profileId: "agent-workforce-llm",
        task: "解释一下咖啡的做法",
      });

      assert.equal(result.finalStatus, "blocked");
      assert.equal(result.runtimeProof.runtimeStarted, false);
      assert.match(result.steps[0].reason, /allowLLM=false/);
    } finally {
      restore();
    }
  });

  await t.test("blocks agent-workforce-llm when DeepSeek API key is missing", async () => {
    const restore = withDeepSeekEnv({ apiKey: undefined });
    try {
      const result = await createRunner().run({
        profileId: "agent-workforce-llm",
        task: "解释一下咖啡的做法",
        allowLLM: true,
      });

      assert.equal(result.finalStatus, "blocked");
      assert.equal(result.runtimeProof.runtimeStarted, false);
      assert.match(result.steps[0].reason, /provider configuration is incomplete/);
      assert.match(result.warnings.join("\n"), /AGENTFLOW_DEEPSEEK_API_KEY|DEEPSEEK_API_KEY/);
    } finally {
      restore();
    }
  });

  await t.test("blocks agent-workforce-llm when provider is still mock", async () => {
    const restore = withProviderEnv({ provider: "mock" });
    try {
      const result = await createRunner().run({
        profileId: "agent-workforce-llm",
        task: "解释一下咖啡的做法",
        allowLLM: true,
      });

      assert.equal(result.finalStatus, "blocked");
      assert.equal(result.runtimeProof.runtimeStarted, false);
      assert.match(result.steps[0].reason, /requires a real LLM provider/);
    } finally {
      restore();
    }
  });

  await t.test("does not call default mock provider when allowLLM uses production registry", async () => {
    const restore = withProviderEnv({ provider: "mock" });
    try {
      const result = await createRunner(undefined, false).run({
        profileId: "agent-workforce-llm",
        task: "解释一下咖啡的做法",
        allowLLM: true,
      });

      assert.equal(result.finalStatus, "blocked");
      assert.equal(result.roleTimeline.length, 0);
      assert.equal(result.runtimeProof.runtimeStarted, false);
    } finally {
      restore();
    }
  });

  await t.test("allows openai-compatible as a real provider when allowLLM=true", async () => {
    const restore = withOpenAICompatibleEnv();
    try {
      const result = await createRunner(new RealProviderMockClient("openai-compatible", "gpt-test")).run({
        profileId: "agent-workforce-llm",
        task: "解释一下咖啡的做法",
        allowLLM: true,
      });

      assert.equal(result.finalStatus, "completed");
      const planner = mustFindRole(result, "Planner");
      assert.equal(planner.isLLMBacked, true);
      assert.equal(planner.modelProvider, "openai-compatible");
      assert.equal(planner.modelName, "gpt-test");
      assert.equal(planner.callStatus, "completed");
    } finally {
      restore();
    }
  });

  await t.test("uses LLMExecutor for Planner/Debater/PlannerRevision/Verifier and keeps Executor mock", async () => {
    const restore = withDeepSeekEnv({ apiKey: "test-key" });
    try {
      const result = await createRunner(new RealProviderMockClient("deepseek", "deepseek-v4-flash")).run({
        profileId: "agent-workforce-llm",
        task: "解释一下咖啡的做法",
        allowLLM: true,
      });

      assert.equal(result.finalStatus, "completed");
      assert.equal(result.steps[0].status, "ran");
      assert.equal(result.runtimeProof.runtimeStarted, true);

      const planner = mustFindRole(result, "Planner");
      const debater = mustFindRole(result, "Debater");
      const revision = mustFindRole(result, "PlannerRevision");
      const executor = mustFindRole(result, "Executor");
      const verifier = mustFindRole(result, "Verifier");

      for (const event of [planner, debater, revision, verifier]) {
        assert.equal(event.executorType, "llm");
        assert.equal(event.isMock, false);
        assert.equal(event.isLLMBacked, true);
        assert.equal(event.modelProvider, "deepseek");
        assert.equal(event.modelName, "deepseek-v4-flash");
        assert.equal(event.callStatus, "completed");
      }

      assert.equal(executor.executorType, "mock");
      assert.equal(executor.isMock, true);
      assert.equal(executor.isLLMBacked, false);
      assert.equal(result.roleTimeline.some((event) => event.role === "CodeExecutor"), false);

      const context = JSON.parse(await readFile(result.contextPath!, "utf8")) as WorkflowContext;
      assert.match(context.executionResult?.deliverable?.content ?? "", /咖啡|手冲|滤杯|热水/);
      assert.equal(context.verification?.answersUserRequest, true);
      assert.equal(context.verification?.isNotMetaOnly, true);
      assert.equal(context.verification?.pass, true);

      const plannerMetadata = JSON.parse(await readFile(planner.subAgentMetadataPath!, "utf8"));
      assert.equal(plannerMetadata.modelProvider, "deepseek");
      assert.equal(plannerMetadata.modelName, "deepseek-v4-flash");
      assert.equal(plannerMetadata.callStatus, "completed");
      assert.equal(result.formattedText.includes("callStatus: completed"), true);
    } finally {
      restore();
    }
  });
});

class RealProviderMockClient implements LLMClient {
  private readonly delegate = new MockLLMClient();
  private readonly provider: string;
  private readonly model: string;

  constructor(provider: string, model: string) {
    this.provider = provider;
    this.model = model;
  }

  async generateStructured<T>(request: LLMStructuredRequest): Promise<LLMStructuredResponse<T>> {
    const response = await this.delegate.generateStructured<T>(request);
    return {
      ...response,
      provider: this.provider,
      model: this.model,
    };
  }
}

function createRunner(llmClient: LLMClient | undefined = new RealProviderMockClient("deepseek", "deepseek-v4-flash"), registerLlm = true): ProfileWorkflowRunner {
  const root = join(tmpdir(), `agentflow-llm-workforce-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const registry = NodeRegistry.withDefaults();
  if (registerLlm && llmClient) registry.register("llm", new LLMExecutor(llmClient));
  return new ProfileWorkflowRunner(
    undefined,
    undefined,
    new WorkflowRunner(registry),
    new ProfileSessionStore(join(root, "sessions")),
    new ScopeConfirmationStore(join(root, "scopes")),
    new ProjectMemoryStore(join(root, "memory")),
  );
}

function withOpenAICompatibleEnv(): () => void {
  const previous = {
    provider: process.env.AGENTFLOW_LLM_PROVIDER,
    key: process.env.AGENTFLOW_LLM_API_KEY,
    baseUrl: process.env.AGENTFLOW_LLM_BASE_URL,
    model: process.env.AGENTFLOW_LLM_MODEL,
  };
  process.env.AGENTFLOW_LLM_PROVIDER = "openai-compatible";
  process.env.AGENTFLOW_LLM_API_KEY = "test-key";
  process.env.AGENTFLOW_LLM_BASE_URL = "https://example.test/v1";
  process.env.AGENTFLOW_LLM_MODEL = "gpt-test";
  return () => {
    restoreEnv("AGENTFLOW_LLM_PROVIDER", previous.provider);
    restoreEnv("AGENTFLOW_LLM_API_KEY", previous.key);
    restoreEnv("AGENTFLOW_LLM_BASE_URL", previous.baseUrl);
    restoreEnv("AGENTFLOW_LLM_MODEL", previous.model);
  };
}

function withProviderEnv(input: { provider: string }): () => void {
  const previous = {
    provider: process.env.AGENTFLOW_LLM_PROVIDER,
    model: process.env.AGENTFLOW_DEEPSEEK_MODEL,
    key: process.env.AGENTFLOW_DEEPSEEK_API_KEY,
    fallbackKey: process.env.DEEPSEEK_API_KEY,
  };
  process.env.AGENTFLOW_LLM_PROVIDER = input.provider;
  delete process.env.AGENTFLOW_DEEPSEEK_MODEL;
  delete process.env.AGENTFLOW_DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  return () => {
    restoreEnv("AGENTFLOW_LLM_PROVIDER", previous.provider);
    restoreEnv("AGENTFLOW_DEEPSEEK_MODEL", previous.model);
    restoreEnv("AGENTFLOW_DEEPSEEK_API_KEY", previous.key);
    restoreEnv("DEEPSEEK_API_KEY", previous.fallbackKey);
  };
}

function mustFindRole(result: Awaited<ReturnType<ProfileWorkflowRunner["run"]>>, role: string) {
  const event = result.roleTimeline.find((item) => item.role === role);
  assert.ok(event, `Expected role ${role} in timeline.`);
  return event;
}

function withDeepSeekEnv(input: { apiKey: string | undefined }): () => void {
  const previous = {
    provider: process.env.AGENTFLOW_LLM_PROVIDER,
    model: process.env.AGENTFLOW_DEEPSEEK_MODEL,
    key: process.env.AGENTFLOW_DEEPSEEK_API_KEY,
    fallbackKey: process.env.DEEPSEEK_API_KEY,
  };
  process.env.AGENTFLOW_LLM_PROVIDER = "deepseek";
  process.env.AGENTFLOW_DEEPSEEK_MODEL = "deepseek-v4-flash";
  if (input.apiKey) {
    process.env.AGENTFLOW_DEEPSEEK_API_KEY = input.apiKey;
  } else {
    delete process.env.AGENTFLOW_DEEPSEEK_API_KEY;
  }
  delete process.env.DEEPSEEK_API_KEY;
  return () => {
    restoreEnv("AGENTFLOW_LLM_PROVIDER", previous.provider);
    restoreEnv("AGENTFLOW_DEEPSEEK_MODEL", previous.model);
    restoreEnv("AGENTFLOW_DEEPSEEK_API_KEY", previous.key);
    restoreEnv("DEEPSEEK_API_KEY", previous.fallbackKey);
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
