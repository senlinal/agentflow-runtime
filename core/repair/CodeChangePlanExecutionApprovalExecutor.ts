import { randomUUID } from "node:crypto";
import type {
  AgentNode,
  CodeChangePlan,
  CodeChangePlanExecutionApprovalRequest,
  NodeExecutor,
  WorkflowContext,
} from "../types.ts";
import { hashCodeChangePlan } from "./CodeChangePlanHasher.ts";

const SENSITIVE_PATH_PATTERN = /(^|\/)\.env($|\.)|\.pem$|\.key$|token|credential|secret/i;
const UNSAFE_COMMAND_PATTERN = /[;&|`$<>]|\brm\b|\bsudo\b|\bcurl\b.*\|\s*(sh|bash)|\bwget\b.*\|\s*(sh|bash)|git\s+(reset\s+--hard|clean\s+-[fdx]+)/i;

export class CodeChangePlanExecutionApprovalGate {
  build(plan: CodeChangePlan, now = new Date()): CodeChangePlanExecutionApprovalRequest {
    if (plan.executable !== false) {
      throw new Error("CodeChangePlanExecutionApprovalGate only accepts non-executable CodeChangePlan objects.");
    }
    if (!plan.requiresExplicitExecutionApproval) {
      throw new Error("CodeChangePlan requiresExplicitExecutionApproval must be true.");
    }
    if (plan.blockedOperations.length > 0) {
      throw new Error(`CodeChangePlan has blocked operations and cannot request execution approval: ${plan.blockedOperations.join("; ")}`);
    }
    if (plan.operations.length === 0) {
      throw new Error("CodeChangePlan execution approval requires at least one operation.");
    }
    if (plan.operations.some((operation) => (operation.type as string) === "delete_file")) {
      throw new Error("CodeChangePlan execution approval does not support delete_file operations.");
    }
    for (const operation of plan.operations) {
      if (operation.targetFile) {
        if (!plan.targetFiles.includes(operation.targetFile)) {
          throw new Error(`CodeChangePlan operation targetFile is outside targetFiles: ${operation.targetFile}`);
        }
        if (plan.forbiddenFiles.includes(operation.targetFile) || SENSITIVE_PATH_PATTERN.test(operation.targetFile)) {
          throw new Error(`CodeChangePlan operation targetFile is forbidden or sensitive: ${operation.targetFile}`);
        }
      }
      if (operation.command) {
        if (!plan.testCommands.includes(operation.command)) {
          throw new Error(`CodeChangePlan operation command is outside testCommands: ${operation.command}`);
        }
        if (UNSAFE_COMMAND_PATTERN.test(operation.command)) {
          throw new Error(`CodeChangePlan operation command is high risk: ${operation.command}`);
        }
      }
    }

    return {
      approvalId: `code_exec_approval_${randomUUID().slice(0, 12)}`,
      codeChangePlanId: plan.planId,
      codeChangePlanHash: hashCodeChangePlan(plan),
      status: "pending",
      requestedAction: "approve_code_change_plan_execution",
      blockedUntilApproved: true,
      requiresExplicitExecutionApproval: true,
      summary: `Execution approval required before applying CodeChangePlan ${plan.planId}.`,
      riskLevel: plan.riskLevel,
      reason: "Materialization is not execution. A separate explicit approval is required before any file writes, commands, tests, or CodeExecutor run can occur.",
      targetFiles: plan.targetFiles,
      operationsCount: plan.operations.length,
      testCommands: plan.testCommands,
      createdAt: now.toISOString(),
    };
  }
}

export class CodeChangePlanExecutionApprovalExecutor implements NodeExecutor {
  private readonly gate: CodeChangePlanExecutionApprovalGate;

  constructor(gate = new CodeChangePlanExecutionApprovalGate()) {
    this.gate = gate;
  }

  async execute(_node: AgentNode, context: WorkflowContext): Promise<unknown> {
    if (!context.codeChangePlan) {
      throw new Error("CodeChangePlanExecutionApprovalGate requires codeChangePlan.");
    }
    return this.gate.build(context.codeChangePlan);
  }
}
