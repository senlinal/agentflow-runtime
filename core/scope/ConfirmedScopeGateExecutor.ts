import type { AgentNode, NodeExecutor, WorkflowContext } from "../types.ts";
import { ScopeConfirmationService } from "./ScopeConfirmationService.ts";

export class ConfirmedScopeGateExecutor implements NodeExecutor {
  private readonly service = new ScopeConfirmationService();

  async execute(_node: AgentNode, context: WorkflowContext): Promise<unknown> {
    return this.service.evaluateGate(context.scopeConfirmationRecord, context.taskNegotiationResult);
  }
}
