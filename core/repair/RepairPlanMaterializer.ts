import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { isInsidePath } from "../execution/PathSafety.ts";
import type {
  CodeChangeOperation,
  CodeChangePlan,
  ProposedRepairOperation,
  RepairApprovalRecord,
  ScopedRepairPlan,
  WorkflowContext,
} from "../types.ts";

const SENSITIVE_PATH_PATTERN = /(^|\/)\.env($|\.)|\.pem$|\.key$|token|credential|secret/i;
const UNSAFE_COMMAND_PATTERN = /[;&|`$<>]|\brm\b|\bsudo\b|\bcurl\b.*\|\s*(sh|bash)|\bwget\b.*\|\s*(sh|bash)|git\s+(reset\s+--hard|clean\s+-[fdx]+)/i;

export class RepairPlanMaterializer {
  materialize(context: WorkflowContext, now = new Date()): CodeChangePlan {
    const plan = context.scopedRepairPlan;
    const approval = context.repairApprovalRecord;
    if (!plan) throw new Error("RepairPlanMaterializer requires scopedRepairPlan.");
    if (!approval) throw new Error("RepairPlanMaterializer requires repairApprovalRecord.");
    assertApprovalCanMaterialize(plan, approval, now);

    const safetyChecks: string[] = [];
    const blockedOperations: string[] = [];
    const projectRoot = String(context.codingTaskContext && "projectRoot" in context.codingTaskContext
      ? (context.codingTaskContext as Record<string, unknown>).projectRoot
      : process.cwd());
    const operations = plan.proposedOperations.flatMap((operation) => {
      const result = materializeOperation(operation, plan, projectRoot);
      safetyChecks.push(...result.safetyChecks);
      blockedOperations.push(...result.blockedOperations);
      return result.operation ? [result.operation] : [];
    });

    const codeChangePlan: CodeChangePlan = {
      planId: `code_change_${stableId([plan.planId, approval.approvalId, operations.map((op) => op.id).join(",")])}`,
      repairPlanId: plan.planId,
      approvalId: approval.approvalId,
      status: "materialized",
      summary: `Safe code change plan materialized from approved repair plan ${plan.planId}.`,
      operations,
      targetFiles: plan.targetFiles,
      forbiddenFiles: plan.forbiddenFiles,
      testCommands: plan.testCommands,
      riskLevel: plan.riskLevel,
      safetyChecks: unique([
        "approval status is approved",
        "materialization did not write files",
        "materialization did not run commands",
        "materialization did not call CodeExecutor",
        ...safetyChecks,
      ]),
      blockedOperations: unique(blockedOperations),
      executable: false,
      requiresExplicitExecutionApproval: true,
      createdAt: now.toISOString(),
    };

    if (codeChangePlan.blockedOperations.length > 0) {
      throw new Error(`Repair plan cannot be materialized safely: ${codeChangePlan.blockedOperations.join("; ")}`);
    }
    return codeChangePlan;
  }
}

function assertApprovalCanMaterialize(plan: ScopedRepairPlan, approval: RepairApprovalRecord, now: Date): void {
  if (approval.repairPlanId !== plan.planId) {
    throw new Error(`Repair approval repairPlanId does not match scopedRepairPlan: ${approval.repairPlanId}`);
  }
  if (approval.status !== "approved") {
    throw new Error(`Repair approval must be approved before materialization; got ${approval.status}.`);
  }
  if (approval.expiresAt && new Date(approval.expiresAt).getTime() <= now.getTime()) {
    throw new Error("Repair approval is expired and cannot be materialized.");
  }
  if (!plan.requiresHumanApproval) {
    throw new Error("ScopedRepairPlan must require human approval.");
  }
}

function materializeOperation(
  operation: ProposedRepairOperation,
  plan: ScopedRepairPlan,
  projectRoot: string,
): { operation: CodeChangeOperation | null; safetyChecks: string[]; blockedOperations: string[] } {
  const safetyChecks: string[] = [];
  const blockedOperations: string[] = [];
  if ((operation.type as string) === "delete_file") {
    blockedOperations.push(`${operation.id}: delete_file is not supported`);
    return { operation: null, safetyChecks, blockedOperations };
  }
  if (operation.targetFile) {
    if (!plan.targetFiles.includes(operation.targetFile)) {
      blockedOperations.push(`${operation.id}: targetFile is outside scoped targetFiles: ${operation.targetFile}`);
    }
    if (plan.forbiddenFiles.includes(operation.targetFile) || isSensitivePath(operation.targetFile)) {
      blockedOperations.push(`${operation.id}: targetFile is forbidden or sensitive: ${operation.targetFile}`);
    }
    if (!isInsidePath(resolve(projectRoot, operation.targetFile), resolve(projectRoot))) {
      blockedOperations.push(`${operation.id}: targetFile is outside project root: ${operation.targetFile}`);
    }
    safetyChecks.push(`${operation.id}: targetFile is scoped`);
  }
  if (operation.command) {
    if (!plan.testCommands.includes(operation.command)) {
      blockedOperations.push(`${operation.id}: command is outside scoped testCommands: ${operation.command}`);
    }
    if (UNSAFE_COMMAND_PATTERN.test(operation.command)) {
      blockedOperations.push(`${operation.id}: command is high risk: ${operation.command}`);
    }
    safetyChecks.push(`${operation.id}: command is scoped`);
  }
  const materializedOperation: CodeChangeOperation = {
      id: operation.id,
      type: operation.type,
      description: operation.description,
      reason: operation.reason,
      safetyConstraints: operation.safetyConstraints,
      ...(operation.targetFile ? { targetFile: operation.targetFile } : {}),
      ...(operation.command ? { command: operation.command } : {}),
    };
  return {
    operation: materializedOperation,
    safetyChecks,
    blockedOperations,
  };
}

function isSensitivePath(path: string): boolean {
  return SENSITIVE_PATH_PATTERN.test(path);
}

function stableId(parts: string[]): string {
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 12);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
