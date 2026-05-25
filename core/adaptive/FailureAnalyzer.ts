import type { FailureAnalysis, VerificationReport } from "../types.ts";

export class FailureAnalyzer {
  analyze(input: {
    verification?: VerificationReport | null;
    routeId?: string;
    attemptedRouteIds?: string[];
    costLevel?: "low" | "medium" | "high";
    riskLevel?: "low" | "medium" | "high";
  }): FailureAnalysis {
    const verification = input.verification;
    if (input.routeId && (input.attemptedRouteIds ?? []).filter((route) => route === input.routeId).length > 1) {
      return analysis("repeated_route", `Route already attempted: ${input.routeId}`, false, undefined, ["repeated_route"]);
    }
    if (input.costLevel === "high") return analysis("high_cost", "Attempt route exceeds cost budget.", false, undefined, ["high_cost"]);
    if (input.riskLevel === "high") return analysis("unsafe_action", "Attempt route exceeds risk budget.", false, undefined, ["high_risk"]);
    if (!verification) return analysis("unknown", "No verifier result is available.", false, undefined, ["missing_verifier_result"]);

    const text = [
      verification.reason,
      verification.feedbackToPlanner,
      ...(verification.failedCriteria ?? []),
      ...(verification.failureCodes ?? []),
      ...(verification.safetyFindings ?? []),
    ].join("\n").toLowerCase();

    if (verification.pass) return analysis("unknown", "Verifier passed; no failure to analyze.", false);
    if (verification.isNotMetaOnly === false || /meta-only|workflow-only|meta only|工作流|空壳/.test(text)) {
      return analysis("meta_only_output", "Verifier rejected meta-only output.", true, "add_missing_content");
    }
    if (verification.deliverableExists === false || /missing.*content|deliverable\.content|missing answer|missing requirement|缺少/.test(text)) {
      return analysis("missing_content", "Verifier found missing content.", true, "add_missing_content");
    }
    if (/schema|invalid json|validation/.test(text)) return analysis("schema_invalid", "Verifier found invalid schema or structured output.", true, "schema_repair");
    if (/test_failed|test failed|failing test/.test(text)) return analysis("test_failed", "Verifier found test failure evidence.", true, "fix_test_failure");
    if (/scope|out of scope|超范围/.test(text)) return analysis("scope_mismatch", "Verifier found a scope mismatch.", false, undefined, ["scope_mismatch"]);
    if (/unsafe|blocked|permission|secret|token|credential|delete/.test(text)) {
      return analysis("unsafe_action", "Verifier found unsafe or blocked action evidence.", false, undefined, ["unsafe_action"]);
    }
    return analysis("unknown", verification.reason || "Verifier failed without a recognized failure type.", true, "retry_with_more_detail");
  }
}

function analysis(
  failureType: FailureAnalysis["failureType"],
  reason: string,
  repairable: boolean,
  suggestedRouteId?: string,
  blockedReasons: string[] = [],
): FailureAnalysis {
  return {
    failureType,
    reason,
    repairable,
    ...(suggestedRouteId ? { suggestedRouteId } : {}),
    blockedReasons,
  };
}
