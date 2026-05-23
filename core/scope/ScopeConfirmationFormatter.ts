import type { ConfirmedScopeGateResult, ScopeConfirmationRecord } from "../types.ts";

export function formatScopeConfirmations(records: ScopeConfirmationRecord[], format: "text" | "json" = "text"): string {
  if (format === "json") return JSON.stringify(records, null, 2);
  if (records.length === 0) return "No scope confirmation records found.";
  return records.map((record) => [
    `confirmationId: ${record.confirmationId}`,
    `status: ${record.status}`,
    `negotiationId: ${record.negotiationId}`,
    `targetModule: ${record.confirmedScope.targetModule ?? "n/a"}`,
    `allowedModules: ${record.confirmedScope.allowedModules.join(", ") || "none"}`,
    `allowedActions: ${record.confirmedScope.allowedActions.join(", ") || "none"}`,
    `blockedActions: ${record.confirmedScope.blockedActions.join(", ") || "none"}`,
    `humanOverride: ${record.humanOverride}`,
    `createdAt: ${record.createdAt}`,
  ].join("\n")).join("\n\n");
}

export function formatScopeConfirmation(record: ScopeConfirmationRecord, format: "text" | "json" = "text"): string {
  if (format === "json") return JSON.stringify(record, null, 2);
  return [
    `confirmationId: ${record.confirmationId}`,
    `status: ${record.status}`,
    `negotiationId: ${record.negotiationId}`,
    `confirmedBy: ${record.confirmedBy ?? "n/a"}`,
    `humanOverride: ${record.humanOverride}`,
    `goal: ${record.confirmedScope.goal}`,
    `targetModule: ${record.confirmedScope.targetModule ?? "n/a"}`,
    `allowedModules: ${record.confirmedScope.allowedModules.join(", ") || "none"}`,
    `forbiddenModules: ${record.confirmedScope.forbiddenModules.join(", ") || "none"}`,
    `allowedFiles: ${(record.confirmedScope.allowedFiles ?? []).join(", ") || "none"}`,
    `forbiddenFiles: ${(record.confirmedScope.forbiddenFiles ?? []).join(", ") || "none"}`,
    `allowedActions: ${record.confirmedScope.allowedActions.join(", ") || "none"}`,
    `blockedActions: ${record.confirmedScope.blockedActions.join(", ") || "none"}`,
    `qualityConstraints: ${record.confirmedScope.qualityConstraints.join("; ") || "none"}`,
    `metricDefinition: ${JSON.stringify(record.confirmedScope.metricDefinition ?? {})}`,
    `ragConstraints: ${JSON.stringify(record.confirmedScope.ragConstraints ?? {})}`,
    `userAnswers: ${record.userAnswers.map((item) => `${item.question} => ${item.answer}`).join("; ") || "none"}`,
    `createdAt: ${record.createdAt}`,
  ].join("\n");
}

export function formatScopeGate(result: ConfirmedScopeGateResult, format: "text" | "json" = "text"): string {
  if (format === "json") return JSON.stringify(result, null, 2);
  return [
    `gateId: ${result.gateId}`,
    `status: ${result.status}`,
    `allowed: ${result.allowed}`,
    `confirmationId: ${result.confirmationId ?? "n/a"}`,
    `negotiationId: ${result.negotiationId ?? "n/a"}`,
    `recommendedNextStep: ${result.recommendedNextStep}`,
    `reason: ${result.reason}`,
    `blockedReasons: ${result.blockedReasons.join("; ") || "none"}`,
    "Confirmed scope gate does not execute code, run tests, or call CodeExecutor.",
  ].join("\n");
}
