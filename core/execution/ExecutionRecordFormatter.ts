import type { CodeChangePlanExecutionRecord, RollbackGuide } from "../types.ts";
import type { ExecutionRecordSummary } from "./ExecutionRecordStore.ts";
import { truncateAndRedact } from "../SecretRedactor.ts";

export type ExecutionFormat = "text" | "json";

export function formatExecutionList(records: ExecutionRecordSummary[], format: ExecutionFormat = "text"): string {
  if (format === "json") return `${JSON.stringify(records, null, 2)}\n`;
  if (records.length === 0) return "No execution records found.\n";
  return `${records.map((record) => [
    record.startedAt,
    record.executionId,
    record.status,
    `plan=${record.codeChangePlanId}`,
    `approval=${record.approvalId}`,
    `verification=${record.verificationPass === null ? "n/a" : record.verificationPass ? "passed" : "failed"}`,
    `consumed=${record.consumedApproval}`,
    `rollback=${record.rollbackGuideId ?? "n/a"}`,
  ].join("\t")).join("\n")}\n`;
}

export function formatExecutionRecord(record: CodeChangePlanExecutionRecord, format: ExecutionFormat = "text"): string {
  if (format === "json") return `${JSON.stringify(record, null, 2)}\n`;
  return [
    `Execution ${record.executionId}`,
    "",
    `status: ${record.status}`,
    `codeChangePlanId: ${record.codeChangePlanId}`,
    `approvalId: ${record.approvalId}`,
    `hash: ${record.codeChangePlanHash}`,
    `hashMatched: ${record.hashMatched}`,
    `consumedApproval: ${record.consumedApproval}`,
    `codeExecutionStatus: ${record.codeExecutionResult?.status ?? "n/a"}`,
    `testExecutionStatus: ${record.testExecutionResult?.status ?? "n/a"}`,
    `verificationPass: ${record.verification?.pass ?? "n/a"}`,
    `checkpointId: ${record.checkpointId ?? "none"}`,
    `changedFiles: ${(record.rollbackGuide?.changedFiles ?? record.codeExecutionResult?.artifacts ?? []).join("; ") || "none"}`,
    `blockedReasons: ${record.blockedReasons.join("; ") || "none"}`,
    `safetyFindings: ${record.safetyFindings.join("; ") || "none"}`,
    `rollbackGuide: ${record.rollbackGuide?.summary ?? "none"}`,
    `executionRecordPath: ${record.executionRecordPath ?? "n/a"}`,
    `rollbackGuidePath: ${record.rollbackGuidePath ?? "n/a"}`,
    "",
  ].map((line) => truncateAndRedact(line, 2_000)).join("\n");
}

export function formatRollbackGuide(guide: RollbackGuide & { executionId?: string }, format: ExecutionFormat = "text"): string {
  if (format === "json") return `${JSON.stringify(guide, null, 2)}\n`;
  return [
    `Rollback Guide ${guide.rollbackId ?? "n/a"}`,
    "",
    `executionId: ${guide.executionId ?? "n/a"}`,
    `workspaceRoot: ${guide.workspaceRoot ?? "n/a"}`,
    `checkpointId: ${guide.checkpointId ?? "none"}`,
    `changedFiles: ${guide.changedFiles.join("; ") || "none"}`,
    `suggestedCommands: ${(guide.suggestedCommands ?? []).join("; ") || "none"}`,
    `manualSteps: ${guide.manualSteps.join("; ") || "none"}`,
    `destructiveRollbackAvailable: ${guide.destructiveRollbackAvailable ?? false}`,
    `destructiveRollbackPerformed: ${guide.destructiveRollbackPerformed}`,
    `reason: ${guide.reason ?? guide.summary}`,
    "",
    "This command only displays rollback guidance. It does not run git reset, checkout, or any other rollback command.",
    "",
  ].map((line) => truncateAndRedact(line, 2_000)).join("\n");
}
