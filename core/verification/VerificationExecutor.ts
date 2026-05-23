import type { AgentNode, NodeExecutor, WorkflowContext } from "../types.ts";
import { ExecutionVerifier } from "./ExecutionVerifier.ts";

export class VerificationExecutor implements NodeExecutor {
  private readonly verifier: ExecutionVerifier;

  constructor(verifier = new ExecutionVerifier()) {
    this.verifier = verifier;
  }

  async execute(_node: AgentNode, context: WorkflowContext): Promise<unknown> {
    const result = this.verifier.verify(context);
    context.runtimeMetadata = {
      ...context.runtimeMetadata,
      executionVerification: result.evidence as unknown as Record<string, unknown>,
    };
    return result.report;
  }
}
