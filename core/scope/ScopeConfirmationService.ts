import { createHash } from "node:crypto";
import type {
  ConfirmedScopeGateResult,
  ScopeConfirmationRecord,
  TaskNegotiationResult,
} from "../types.ts";

export type ScopeConfirmationInput = {
  negotiation: TaskNegotiationResult;
  status?: ScopeConfirmationRecord["status"];
  confirmedBy?: string;
  humanOverride?: boolean;
  confirmedScope?: Partial<ScopeConfirmationRecord["confirmedScope"]>;
  userAnswers?: ScopeConfirmationRecord["userAnswers"];
  assumptionsAccepted?: string[];
  assumptionsRejected?: string[];
  notes?: string;
  expiresAt?: string;
};

export class ScopeConfirmationService {
  createRecord(input: ScopeConfirmationInput): ScopeConfirmationRecord {
    const status = input.status ?? "confirmed";
    const humanOverride = input.humanOverride ?? false;
    const confirmedScope = buildConfirmedScope(input.negotiation, input.confirmedScope);
    const issues = validateScopeAgainstNegotiation(input.negotiation, confirmedScope, humanOverride);
    if (issues.length > 0) throw new Error(`Scope confirmation would expand negotiated scope: ${issues.join("; ")}`);
    validateRagRequirements(input.negotiation, confirmedScope, status);
    const now = new Date().toISOString();
    return {
      confirmationId: `scope_${stableId(input.negotiation.negotiationId, status, JSON.stringify(confirmedScope))}`,
      negotiationId: input.negotiation.negotiationId,
      status,
      ...(status === "confirmed" ? { confirmedAt: now } : {}),
      ...(status === "rejected" ? { rejectedAt: now } : {}),
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      ...(input.confirmedBy ? { confirmedBy: input.confirmedBy } : {}),
      humanOverride,
      confirmedScope,
      userAnswers: input.userAnswers ?? input.negotiation.clarificationQuestions.map((question) => ({ question, answer: "Confirmed for demo scope." })),
      assumptionsAccepted: input.assumptionsAccepted ?? input.negotiation.ambiguities,
      assumptionsRejected: input.assumptionsRejected ?? [],
      ...(input.notes ? { notes: input.notes } : {}),
      createdAt: now,
    };
  }

  evaluateGate(record: ScopeConfirmationRecord | null | undefined, negotiation?: TaskNegotiationResult | null): ConfirmedScopeGateResult {
    const now = new Date().toISOString();
    const blockedReasons: string[] = [];
    if (!record) {
      blockedReasons.push("Missing ScopeConfirmationRecord.");
    } else {
      if (record.status !== "confirmed") blockedReasons.push(`Scope confirmation status is ${record.status}.`);
      if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) blockedReasons.push("Scope confirmation is expired.");
      if (negotiation && record.negotiationId !== negotiation.negotiationId) blockedReasons.push("Scope confirmation does not match TaskNegotiationResult.negotiationId.");
      if (record.confirmedScope.allowedModules.length === 0) blockedReasons.push("Confirmed scope must include allowedModules.");
      if (record.confirmedScope.allowedActions.length === 0) blockedReasons.push("Confirmed scope must include allowedActions.");
      if (record.confirmedScope.blockedActions.length === 0) blockedReasons.push("Confirmed scope must include blockedActions.");
      if (record.confirmedScope.qualityConstraints.length === 0) blockedReasons.push("Confirmed scope must include qualityConstraints.");
      if (record.confirmedScope.blockedActions.includes("execute_code") && !record.confirmedScope.allowedActions.includes("evaluate_feasibility")) {
        blockedReasons.push("Scope blocks execution but does not allow a safe next action.");
      }
    }

    const allowed = blockedReasons.length === 0;
    return {
      gateId: `scope_gate_${stableId(record?.confirmationId ?? "missing", now)}`,
      ...(record?.confirmationId ? { confirmationId: record.confirmationId } : {}),
      ...(record?.negotiationId ? { negotiationId: record.negotiationId } : {}),
      allowed,
      status: allowed ? "allowed" : "blocked",
      reason: allowed
        ? "Confirmed scope is valid for proceeding to feasibility."
        : `Confirmed scope gate blocked: ${blockedReasons.join("; ")}`,
      blockedReasons,
      ...(allowed && record ? { confirmedScope: record.confirmedScope } : {}),
      recommendedNextStep: allowed ? "proceed_to_feasibility" : record?.status === "rejected" ? "stop" : "ask_human",
      createdAt: now,
    };
  }
}

function buildConfirmedScope(
  negotiation: TaskNegotiationResult,
  override?: Partial<ScopeConfirmationRecord["confirmedScope"]>,
): ScopeConfirmationRecord["confirmedScope"] {
  const proposed = negotiation.proposedScope;
  const confirmed: ScopeConfirmationRecord["confirmedScope"] = {
    goal: override?.goal ?? negotiation.understoodGoal,
    ...(override?.targetModule ?? negotiation.targetModule ? { targetModule: override?.targetModule ?? negotiation.targetModule } : {}),
    allowedModules: override?.allowedModules ?? proposed.allowedModules,
    forbiddenModules: override?.forbiddenModules ?? proposed.forbiddenModules,
    ...(override?.allowedFiles ?? proposed.allowedFiles ? { allowedFiles: override?.allowedFiles ?? proposed.allowedFiles } : {}),
    ...(override?.forbiddenFiles ?? proposed.forbiddenFiles ? { forbiddenFiles: override?.forbiddenFiles ?? proposed.forbiddenFiles } : {}),
    allowedActions: override?.allowedActions ?? proposed.allowedActions,
    blockedActions: override?.blockedActions ?? proposed.blockedActions,
    qualityConstraints: override?.qualityConstraints ?? proposed.qualityConstraints,
    ...(override?.metricDefinition ? { metricDefinition: override.metricDefinition } : {}),
    ...(override?.ragConstraints ? { ragConstraints: override.ragConstraints } : {}),
  };
  return confirmed;
}

function validateScopeAgainstNegotiation(
  negotiation: TaskNegotiationResult,
  scope: ScopeConfirmationRecord["confirmedScope"],
  humanOverride: boolean,
): string[] {
  if (humanOverride) return [];
  const proposed = negotiation.proposedScope;
  const issues: string[] = [];
  for (const moduleName of scope.allowedModules) {
    if (!proposed.allowedModules.includes(moduleName)) issues.push(`allowedModules adds ${moduleName}`);
  }
  for (const action of scope.allowedActions) {
    if (action === "evaluate_feasibility") continue;
    if (!proposed.allowedActions.includes(action)) issues.push(`allowedActions adds ${action}`);
  }
  for (const file of scope.allowedFiles ?? []) {
    if (!(proposed.allowedFiles ?? []).includes(file)) issues.push(`allowedFiles adds ${file}`);
  }
  return issues;
}

function validateRagRequirements(
  negotiation: TaskNegotiationResult,
  scope: ScopeConfirmationRecord["confirmedScope"],
  status: ScopeConfirmationRecord["status"],
): void {
  if (status !== "confirmed" || negotiation.detectedTaskType !== "rag_optimization") return;
  if (!scope.metricDefinition?.primaryMetric) {
    throw new Error("Confirmed RAG scope requires metricDefinition.primaryMetric.");
  }
  if (!scope.ragConstraints) {
    throw new Error("Confirmed RAG scope requires ragConstraints.");
  }
}

function stableId(...values: string[]): string {
  return createHash("sha256").update(values.join("\n")).digest("hex").slice(0, 12);
}
