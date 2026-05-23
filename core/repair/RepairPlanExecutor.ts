import type { AgentNode, NodeExecutor, WorkflowContext } from "../types.ts";
import { RepairPlanBuilder } from "./RepairPlanBuilder.ts";

export class RepairPlanExecutor implements NodeExecutor {
  private readonly builder: RepairPlanBuilder;

  constructor(builder = new RepairPlanBuilder()) {
    this.builder = builder;
  }

  async execute(_node: AgentNode, context: WorkflowContext): Promise<unknown> {
    return this.builder.build(context);
  }
}
