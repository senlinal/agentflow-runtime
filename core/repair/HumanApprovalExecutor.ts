import type { AgentNode, NodeExecutor, WorkflowContext } from "../types.ts";
import { HumanApprovalRequestBuilder } from "./RepairPlanBuilder.ts";

export class HumanApprovalExecutor implements NodeExecutor {
  private readonly builder: HumanApprovalRequestBuilder;

  constructor(builder = new HumanApprovalRequestBuilder()) {
    this.builder = builder;
  }

  async execute(_node: AgentNode, context: WorkflowContext): Promise<unknown> {
    if (!context.scopedRepairPlan) throw new Error("HumanApprovalGate requires scopedRepairPlan.");
    return this.builder.build(context.scopedRepairPlan);
  }
}
