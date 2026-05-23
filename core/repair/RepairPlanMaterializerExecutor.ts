import type { AgentNode, NodeExecutor, WorkflowContext } from "../types.ts";
import { RepairPlanMaterializer } from "./RepairPlanMaterializer.ts";

export class RepairPlanMaterializerExecutor implements NodeExecutor {
  private readonly materializer: RepairPlanMaterializer;

  constructor(materializer = new RepairPlanMaterializer()) {
    this.materializer = materializer;
  }

  async execute(_node: AgentNode, context: WorkflowContext): Promise<unknown> {
    return this.materializer.materialize(context);
  }
}
