import type { LLMClient } from "./LLMClient.ts";
import { LLMClientFactory } from "./LLMClientFactory.ts";
import { PromptRenderer } from "./PromptRenderer.ts";
import { readPath } from "./context.ts";
import { SchemaValidator } from "./SchemaValidator.ts";
import { redactSecrets } from "./SecretRedactor.ts";
import type { AgentNode, NodeExecutor, WorkflowContext } from "./types.ts";

export class LLMExecutor implements NodeExecutor {
  private readonly llmClient: LLMClient;
  private readonly promptRenderer: PromptRenderer;

  constructor(llmClient: LLMClient = LLMClientFactory.fromEnv(), promptRenderer = new PromptRenderer()) {
    this.llmClient = llmClient;
    this.promptRenderer = promptRenderer;
  }

  async execute(node: AgentNode, context: WorkflowContext): Promise<unknown> {
    const input = Object.fromEntries(node.inputKeys.map((key) => [key, readPath(context, key)]));
    const prompt = this.promptRenderer.render({
      role: node.role,
      systemPrompt: node.systemPrompt ?? node.description,
      input,
      outputSchemaName: node.outputSchema,
    });
    try {
      const response = await this.llmClient.generateStructured({
        role: node.role,
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        input,
        outputSchemaName: node.outputSchema,
        retryPolicy: node.retryPolicy,
        metadata: {
          nodeId: node.id,
          outputKey: node.outputKey,
        },
        context,
      });
      appendLlmCallMetadata(context, {
        nodeId: node.id,
        provider: response.provider,
        model: response.model ?? null,
        attempts: response.attempts,
        outputSchemaName: node.outputSchema,
        success: true,
        callStatus: "completed",
        warnings: context.runtimeMetadata?.llmConfigSummary?.warnings ?? [],
      });
      return SchemaValidator.validate(node.outputSchema, response.output);
    } catch (error) {
      appendLlmCallMetadata(context, {
        nodeId: node.id,
        outputSchemaName: node.outputSchema,
        success: false,
        callStatus: "failed",
        error: redactSecrets(error instanceof Error ? error.message : String(error)),
        warnings: context.runtimeMetadata?.llmConfigSummary?.warnings ?? [],
      });
      throw error;
    }
  }
}

function appendLlmCallMetadata(context: WorkflowContext, metadata: Record<string, unknown>): void {
  context.runtimeMetadata = {
    ...context.runtimeMetadata,
    llmCalls: [...(context.runtimeMetadata?.llmCalls ?? []), metadata],
  };
}
