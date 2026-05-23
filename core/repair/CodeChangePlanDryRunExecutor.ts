import { randomUUID } from "node:crypto";
import type {
  AgentNode,
  CodeChangePlan,
  CodeChangePlanDryRunExecutionPlan,
  CodeChangePlanExecutionApprovalRecord,
  NodeExecutor,
  WorkflowContext,
} from "../types.ts";
import { hashCodeChangePlan } from "./CodeChangePlanHasher.ts";

const SENSITIVE_PATH_PATTERN = /(^|\/)\.env($|\.)|\.pem$|\.key$|token|credential|secret/i;
const UNSAFE_COMMAND_PATTERN = /[;&|`$<>]|\brm\b|\bsudo\b|\bcurl\b.*\|\s*(sh|bash)|\bwget\b.*\|\s*(sh|bash)|git\s+(reset\s+--hard|clean\s+-[fdx]+)/i;

export class CodeChangePlanDryRunRunner {
  build(
    plan: CodeChangePlan,
    approval: CodeChangePlanExecutionApprovalRecord,
    now = new Date(),
  ): CodeChangePlanDryRunExecutionPlan {
    assertApprovalCanDryRun(plan, approval, now);
    assertPlanCanDryRun(plan);
    const hash = hashCodeChangePlan(plan);
    if (hash !== approval.codeChangePlanHash) {
      throw new Error(`CodeChangePlan hash mismatch: expected ${approval.codeChangePlanHash}, got ${hash}.`);
    }

    return {
      dryRunId: `dry_run_${randomUUID().slice(0, 12)}`,
      codeChangePlanId: plan.planId,
      codeChangePlanHash: hash,
      approvalId: approval.approvalId,
      approvalStatus: "approved",
      status: "planned",
      mode: "dry_run",
      hashMatched: true,
      summary: `Dry-run execution plan prepared for CodeChangePlan ${plan.planId}. No operations were executed.`,
      operations: plan.operations,
      targetFiles: plan.targetFiles,
      expectedFilesChanged: plan.targetFiles,
      forbiddenFiles: plan.forbiddenFiles,
      testCommands: plan.testCommands,
      riskLevel: plan.riskLevel,
      safetyChecks: [
        "execution approval status is approved",
        "CodeChangePlan hash matches approval record",
        "dry-run did not write files",
        "dry-run did not run commands",
        "dry-run did not run tests",
        "dry-run did not call CodeExecutor",
        "approval was not consumed",
      ],
      blockedReasons: [],
      wouldWriteFiles: false,
      wouldRunCommands: false,
      wouldRunTests: false,
      wouldCallCodeExecutor: false,
      consumesApproval: false,
      requiresExecuteFlag: true,
      requiresSeparateExecutionStep: true,
      createdAt: now.toISOString(),
    };
  }
}

export class CodeChangePlanDryRunExecutor implements NodeExecutor {
  private readonly runner: CodeChangePlanDryRunRunner;

  constructor(runner = new CodeChangePlanDryRunRunner()) {
    this.runner = runner;
  }

  async execute(_node: AgentNode, context: WorkflowContext): Promise<unknown> {
    if (!context.codeChangePlan) {
      throw new Error("CodeChangePlanDryRunRunner requires codeChangePlan.");
    }
    if (!context.codeChangePlanExecutionApprovalRecord) {
      throw new Error("CodeChangePlanDryRunRunner requires codeChangePlanExecutionApprovalRecord.");
    }
    return this.runner.build(context.codeChangePlan, context.codeChangePlanExecutionApprovalRecord);
  }
}

function assertApprovalCanDryRun(
  plan: CodeChangePlan,
  approval: CodeChangePlanExecutionApprovalRecord,
  now: Date,
): void {
  if (approval.codeChangePlanId !== plan.planId) {
    throw new Error(`Execution approval codeChangePlanId does not match CodeChangePlan: ${approval.codeChangePlanId}`);
  }
  if (approval.requestedAction !== "approve_code_change_plan_execution") {
    throw new Error(`Execution approval requestedAction is invalid: ${approval.requestedAction}`);
  }
  if (approval.status !== "approved") {
    throw new Error(`Execution approval must be approved before dry-run; got ${approval.status}.`);
  }
  if (approval.expiresAt && new Date(approval.expiresAt).getTime() <= now.getTime()) {
    throw new Error("Execution approval is expired and cannot dry-run.");
  }
}

function assertPlanCanDryRun(plan: CodeChangePlan): void {
  if (plan.executable !== false) {
    throw new Error("Dry-run only accepts non-executable CodeChangePlan objects.");
  }
  if (!plan.requiresExplicitExecutionApproval) {
    throw new Error("CodeChangePlan requiresExplicitExecutionApproval must be true.");
  }
  if (plan.blockedOperations.length > 0) {
    throw new Error(`CodeChangePlan has blocked operations and cannot dry-run: ${plan.blockedOperations.join("; ")}`);
  }
  if (plan.operations.length === 0) {
    throw new Error("CodeChangePlan dry-run requires at least one operation.");
  }
  for (const operation of plan.operations) {
    if ((operation.type as string) === "delete_file") {
      throw new Error("CodeChangePlan dry-run does not support delete_file operations.");
    }
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
}
