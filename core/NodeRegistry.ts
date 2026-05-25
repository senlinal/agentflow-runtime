import { CodeExecutor } from "./execution/CodeExecutor.ts";
import { TestExecutor } from "./execution/TestExecutor.ts";
import { LLMExecutor } from "./LLMExecutor.ts";
import { MockExecutor } from "./MockExecutor.ts";
import type { AgentNode, NodeExecutor } from "./types.ts";
import { TaskNegotiatorExecutor } from "./negotiation/TaskNegotiatorExecutor.ts";
import { ConfirmedScopeGateExecutor } from "./scope/ConfirmedScopeGateExecutor.ts";
import { HumanApprovalExecutor } from "./repair/HumanApprovalExecutor.ts";
import { CodeChangePlanDryRunExecutor } from "./repair/CodeChangePlanDryRunExecutor.ts";
import { CodeChangePlanExecutionExecutor } from "./repair/CodeChangePlanExecutionExecutor.ts";
import { CodeChangePlanExecutionApprovalExecutor } from "./repair/CodeChangePlanExecutionApprovalExecutor.ts";
import { RepairPlanExecutor } from "./repair/RepairPlanExecutor.ts";
import { RepairPlanMaterializerExecutor } from "./repair/RepairPlanMaterializerExecutor.ts";
import { VerificationExecutor } from "./verification/VerificationExecutor.ts";
import { AdaptiveExecutionController } from "./adaptive/AdaptiveExecutionController.ts";
import { AttemptExecutor } from "./adaptive/AttemptExecutor.ts";
import { GoalPlanner } from "./adaptive/GoalPlanner.ts";

export class NodeRegistry {
  private readonly executors = new Map<string, NodeExecutor>();

  static withDefaults(): NodeRegistry {
    const registry = new NodeRegistry();
    registry.register("mock", new MockExecutor());
    registry.register("negotiate", new TaskNegotiatorExecutor());
    registry.register("scopeGate", new ConfirmedScopeGateExecutor());
    registry.register("code", new CodeExecutor());
    registry.register("test", new TestExecutor());
    registry.register("verify", new VerificationExecutor());
    registry.register("repair", new RepairPlanExecutor());
    registry.register("approval", new HumanApprovalExecutor());
    registry.register("materialize", new RepairPlanMaterializerExecutor());
    registry.register("executionApproval", new CodeChangePlanExecutionApprovalExecutor());
    registry.register("executionDryRun", new CodeChangePlanDryRunExecutor());
    registry.register("execution", new CodeChangePlanExecutionExecutor());
    registry.register("goalPlanner", new GoalPlanner());
    registry.register("attempt", new AttemptExecutor());
    registry.register("adaptive", new AdaptiveExecutionController());
    return registry;
  }

  register(type: AgentNode["type"], executor: NodeExecutor): void {
    this.executors.set(type, executor);
  }

  getExecutor(node: AgentNode): NodeExecutor {
    if (node.type === "llm" && !this.executors.has("llm")) {
      this.register("llm", new LLMExecutor());
    }
    const executor = this.executors.get(node.type);
    if (!executor) {
      throw new Error(`No executor registered for node type: ${node.type}`);
    }
    return executor;
  }
}
