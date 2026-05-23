import { createHash } from "node:crypto";
import type { CodeChangePlan } from "../types.ts";

export function hashCodeChangePlan(plan: CodeChangePlan): string {
  return `sha256:${createHash("sha256").update(stableStringify(normalize(plan))).digest("hex")}`;
}

function normalize(plan: CodeChangePlan): Record<string, unknown> {
  return {
    planId: plan.planId,
    repairPlanId: plan.repairPlanId,
    status: plan.status,
    summary: plan.summary,
    operations: plan.operations,
    targetFiles: plan.targetFiles,
    forbiddenFiles: plan.forbiddenFiles,
    testCommands: plan.testCommands,
    riskLevel: plan.riskLevel,
    safetyChecks: plan.safetyChecks,
    blockedOperations: plan.blockedOperations,
    executable: plan.executable,
    requiresExplicitExecutionApproval: plan.requiresExplicitExecutionApproval,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
