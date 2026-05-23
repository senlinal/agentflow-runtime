import type { LLMClient } from "./LLMClient.ts";
import { MockLLMClient } from "./MockLLMClient.ts";
import { readPath } from "./context.ts";
import { SchemaValidator } from "./SchemaValidator.ts";
import type { AgentNode, NodeExecutor, WorkflowContext } from "./types.ts";

export class MockExecutor implements NodeExecutor {
  private readonly llmClient: LLMClient;

  constructor(llmClient: LLMClient = new MockLLMClient()) {
    this.llmClient = llmClient;
  }

  async execute(node: AgentNode, context: WorkflowContext): Promise<unknown> {
    const input = Object.fromEntries(node.inputKeys.map((key) => [key, readPath(context, key)]));
    const response = await this.llmClient.generateStructured({
      role: node.role,
      systemPrompt: node.systemPrompt ?? node.description,
      userPrompt: `Run node ${node.id} and return ${node.outputSchema}.`,
      input,
      outputSchemaName: node.outputSchema,
      retryPolicy: node.retryPolicy,
      context,
    });
    return SchemaValidator.validate(node.outputSchema, response.output);
  }
}
