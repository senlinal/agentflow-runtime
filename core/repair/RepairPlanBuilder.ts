import { createHash, randomUUID } from "node:crypto";
import type {
  HumanApprovalRequest,
  ProposedRepairOperation,
  ScopedRepairPlan,
  VerificationReport,
  WorkflowContext,
} from "../types.ts";

export class RepairPlanBuilder {
  build(context: WorkflowContext): ScopedRepairPlan {
    const verification = context.verification;
    if (!verification || verification.pass) {
      throw new Error("RepairPlanBuilder requires a failed VerificationReport.");
    }

    const evidence = asRecord(verification.evidence);
    const failureCodes = verification.failureCodes ?? inferFailureCodes(verification);
    const targetFiles = unique([
      ...stringArray(evidence.filesChanged),
      ...stringArray(evidence.filesAdded),
      ...stringArray(evidence.filesModified),
      ...(context.codingTaskContext?.allowedFiles ?? []),
    ]).filter((file) => !isForbiddenFile(file));
    const forbiddenFiles = unique([
      ...stringArray(evidence.filesDeleted),
      ...stringArray(evidence.safetyFindings),
      ".env",
      ".env.local",
      "*.pem",
      "*.key",
    ]);
    const testCommands = unique([
      ...extractTestCommands(evidence.failedCommands),
      ...extractConfiguredTestCommands(context.testExecutionResult?.rawOutput),
    ]);
    const riskLevel = determineRiskLevel(failureCodes, stringArray(evidence.safetyFindings), stringArray(evidence.filesDeleted));
    const proposedOperations = buildOperations(failureCodes, targetFiles, testCommands);

    return {
      planId: `repair_${stableId([
        context.taskId,
        failureCodes.join(","),
        targetFiles.join(","),
        verification.reason,
      ])}`,
      summary: `Scoped repair plan for failed verification: ${failureCodes.join(", ") || "unknown"}.`,
      basedOnFailureCodes: failureCodes,
      basedOnFailedCriteria: verification.failedCriteria,
      targetFiles,
      forbiddenFiles,
      proposedOperations,
      testCommands,
      riskLevel,
      requiresHumanApproval: true,
      rationale: "Verification failed, so the workflow produces a bounded repair plan and stops for human approval instead of re-running CodeExecutor.",
      safetyNotes: [
        "Do not execute this repair plan automatically.",
        "Do not expand CodeExecutor permissions to make the repair pass.",
        "Do not delete files.",
        "Do not touch forbidden files or secret-bearing paths.",
      ],
    };
  }
}

export class HumanApprovalRequestBuilder {
  build(plan: ScopedRepairPlan, now = new Date()): HumanApprovalRequest {
    return {
      approvalId: `approval_${randomUUID().slice(0, 12)}`,
      status: "pending",
      summary: `Human approval required before any scoped repair for ${plan.planId}.`,
      repairPlanId: plan.planId,
      requestedAction: "approve_scoped_repair_plan",
      riskLevel: plan.riskLevel,
      requiresHumanApproval: true,
      blockedUntilApproved: true,
      approvalInstructions: [
        "Review targetFiles, forbiddenFiles, proposedOperations, and testCommands.",
        "Approve only if the repair scope is narrow and matches the failed verification evidence.",
        "A later workflow stage must create a new explicit execution request; this approval does not execute code.",
      ],
      createdAt: now.toISOString(),
    };
  }
}

function inferFailureCodes(report: VerificationReport): string[] {
  return unique(report.failedCriteria.map((criterion) => criterion.split(":")[0]).filter(Boolean));
}

function buildOperations(failureCodes: string[], targetFiles: string[], testCommands: string[]): ProposedRepairOperation[] {
  const operations: ProposedRepairOperation[] = [];
  if (failureCodes.some((code) => code === "test_failed" || code === "success_criteria_failed")) {
    operations.push({
      id: "repair_op_inspect_failure",
      type: "inspect",
      description: "Inspect failing test output and verification evidence before preparing any patch.",
      reason: "The verifier reported failed tests or unmet success criteria.",
      safetyConstraints: ["Read-only inspection only.", "Do not execute arbitrary commands."],
    });
  }
  for (const [index, targetFile] of targetFiles.entries()) {
    operations.push({
      id: `repair_op_modify_${index + 1}`,
      type: "modify_file",
      targetFile,
      description: `Prepare a minimal patch for ${targetFile}.`,
      reason: "The file is within the scoped target set derived from execution evidence or allowedFiles.",
      safetyConstraints: ["No file deletion.", "No secret files.", "Keep patch below maxPatchSize."],
    });
  }
  for (const [index, command] of testCommands.entries()) {
    operations.push({
      id: `repair_op_test_${index + 1}`,
      type: "run_test",
      command,
      description: `Re-run configured test command: ${command}`,
      reason: "The command was part of the configured TestRunner evidence.",
      safetyConstraints: ["Run only through TestRunner or CommandRunner allowlist.", "Do not add new shell commands."],
    });
  }
  if (operations.length === 0) {
    operations.push({
      id: "repair_op_manual_review",
      type: "manual_review",
      description: "Review verification evidence and define a narrower repair scope.",
      reason: "The verifier did not provide enough safe target evidence for an automated patch proposal.",
      safetyConstraints: ["Human approval required.", "Do not execute code automatically."],
    });
  }
  return operations;
}

function determineRiskLevel(failureCodes: string[], safetyFindings: string[], deletedFiles: string[]): ScopedRepairPlan["riskLevel"] {
  if (
    safetyFindings.length > 0 ||
    deletedFiles.length > 0 ||
    failureCodes.some((code) => ["unsafe_file_touched", "file_deleted", "operation_blocked"].includes(code))
  ) {
    return "high";
  }
  if (failureCodes.some((code) => ["unexpected_files_changed", "diff_too_large", "patch_too_large"].includes(code))) {
    return "medium";
  }
  return "low";
}

function extractTestCommands(commands: string[]): string[] {
  return commands.filter(Boolean);
}

function extractConfiguredTestCommands(rawOutput: string | undefined): string[] {
  const raw = parseRaw(rawOutput);
  const commands = Array.isArray(raw.commands) ? raw.commands : [];
  return commands
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => [String(item.command ?? ""), ...(Array.isArray(item.args) ? item.args.map(String) : [])].join(" ").trim())
    .filter(Boolean);
}

function parseRaw(rawOutput: string | undefined): Record<string, unknown> {
  if (!rawOutput) return {};
  try {
    const parsed = JSON.parse(rawOutput) as unknown;
    return asRecord(parsed);
  } catch {
    return {};
  }
}

function isForbiddenFile(file: string): boolean {
  return /\.(env|pem|key)$/i.test(file) || /token|credential|secret/i.test(file);
}

function stableId(parts: string[]): string {
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 12);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
