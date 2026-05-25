import { AttemptStore } from "./AttemptStore.ts";
import { FailureAnalyzer } from "./FailureAnalyzer.ts";
import type { AgentNode, AttemptDecision, ExecutionAttempt, GoalCandidateRoute, NodeExecutor, WorkflowContext } from "../types.ts";

export class AdaptiveExecutionController implements NodeExecutor {
  private readonly failureAnalyzer: FailureAnalyzer;
  private readonly storeFactory: typeof AttemptStore.fromContext;

  constructor(
    failureAnalyzer = new FailureAnalyzer(),
    storeFactory = AttemptStore.fromContext,
  ) {
    this.failureAnalyzer = failureAnalyzer;
    this.storeFactory = storeFactory;
  }

  async execute(_node: AgentNode, context: WorkflowContext): Promise<AttemptDecision> {
    const decision = this.decide(context);
    const attempt = buildAttempt(context, decision);
    context.executionAttempt = attempt;
    context.attemptDecision = decision;
    context.adaptiveState = {
      goalPlan: context.goalExecutionPlan ?? context.adaptiveState?.goalPlan,
      attempts: [...(context.adaptiveState?.attempts ?? []), attempt],
      decisions: [...(context.adaptiveState?.decisions ?? []), decision],
      currentAttemptNumber: attempt.attemptNumber,
      currentRouteId: decision.nextRouteId ?? attempt.routeId,
      status: statusFor(decision.decision),
    };
    const store = this.storeFactory(context);
    if (store) await store.saveAttemptWithDecision(attempt, decision);
    return decision;
  }

  decide(context: WorkflowContext): AttemptDecision {
    const now = new Date().toISOString();
    const plan = context.goalExecutionPlan ?? context.adaptiveState?.goalPlan;
    const verification = context.verification;
    const attempts = context.adaptiveState?.attempts ?? [];
    const currentRouteId = context.adaptiveState?.currentRouteId ?? plan?.candidateRoutes[0]?.routeId ?? "direct_deliverable";
    const attemptNumber = (context.adaptiveState?.currentAttemptNumber ?? attempts.length + 1);
    const currentRoute = plan?.candidateRoutes.find((route) => route.routeId === currentRouteId);

    if (verification?.pass === true) {
      return {
        decision: "success",
        reason: "Verifier passed; goal is complete.",
        blockedReasons: [],
        shouldUpdateMemory: true,
        attemptId: attemptId(attemptNumber),
        attemptNumber,
        routeId: currentRouteId,
        createdAt: now,
      };
    }

    if (plan && attemptNumber >= plan.maxAttempts) {
      return stop(`Reached maxAttempts=${plan.maxAttempts}.`, ["max_attempts_reached"], attemptNumber, currentRouteId, now);
    }

    if (exceedsBudget(currentRoute?.costLevel, plan?.costBudget)) {
      return askHuman("Next route would exceed cost budget.", ["high_cost"], attemptNumber, currentRouteId, now);
    }
    if (exceedsBudget(currentRoute?.riskLevel, plan?.riskBudget)) {
      return askHuman("Next route would exceed risk budget.", ["high_risk"], attemptNumber, currentRouteId, now);
    }

    const analysis = this.failureAnalyzer.analyze({
      verification,
      routeId: currentRouteId,
      attemptedRouteIds: [...attempts.map((attempt) => attempt.routeId), currentRouteId],
      costLevel: currentRoute?.costLevel,
      riskLevel: currentRoute?.riskLevel,
    });
    if (analysis.blockedReasons.includes("scope_mismatch")) return askHuman(analysis.reason, analysis.blockedReasons, attemptNumber, currentRouteId, now, analysis);
    if (analysis.blockedReasons.includes("unsafe_action") || analysis.blockedReasons.includes("high_risk") || analysis.blockedReasons.includes("high_cost")) {
      return askHuman(analysis.reason, analysis.blockedReasons, attemptNumber, currentRouteId, now, analysis);
    }
    if (!analysis.repairable) return stop(analysis.reason, analysis.blockedReasons.length ? analysis.blockedReasons : [analysis.failureType], attemptNumber, currentRouteId, now, analysis);

    const nextRoute = chooseNextRoute(plan?.candidateRoutes ?? [], attempts, currentRouteId, analysis.suggestedRouteId);
    if (!nextRoute) {
      return stop("No untried repair route remains.", ["routes_exhausted"], attemptNumber, currentRouteId, now, analysis);
    }
    if (attempts.some((attempt) => attempt.routeId === nextRoute.routeId)) {
      return stop(`RouteGuard blocked repeated route: ${nextRoute.routeId}`, ["repeated_route"], attemptNumber, currentRouteId, now, analysis);
    }
    return {
      decision: "retry",
      reason: `Verifier failed with ${analysis.failureType}; retry with route ${nextRoute.routeId}.`,
      nextRouteId: nextRoute.routeId,
      blockedReasons: [],
      shouldUpdateMemory: true,
      failureAnalysis: analysis,
      attemptId: attemptId(attemptNumber),
      attemptNumber,
      routeId: currentRouteId,
      createdAt: now,
    };
  }
}

function buildAttempt(context: WorkflowContext, decision: AttemptDecision): ExecutionAttempt {
  const attemptNumber = decision.attemptNumber ?? context.adaptiveState?.currentAttemptNumber ?? 1;
  const routeId = decision.routeId ?? context.adaptiveState?.currentRouteId ?? "direct_deliverable";
  return {
    attemptId: decision.attemptId ?? attemptId(attemptNumber),
    attemptNumber,
    routeId,
    actionSummary: context.executionResult?.summary ?? `Attempt ${attemptNumber} via ${routeId}`,
    inputArtifacts: [
      ...(context.goalExecutionPlan ? [`goalPlan:${context.goalExecutionPlan.planId}`] : []),
    ],
    outputArtifacts: context.executionResult?.artifacts ?? [],
    resultSummary: context.executionResult?.summary ?? "No execution result summary.",
    ...(context.verification ? { verifierResult: context.verification } : {}),
    ...(context.verification?.pass === false ? { failureReason: context.verification.reason } : {}),
    createdAt: decision.createdAt,
  };
}

function chooseNextRoute(
  routes: GoalCandidateRoute[],
  attempts: ExecutionAttempt[],
  currentRouteId: string,
  suggestedRouteId: string | undefined,
): GoalCandidateRoute | undefined {
  const attempted = new Set([...attempts.map((attempt) => attempt.routeId), currentRouteId]);
  if (suggestedRouteId) {
    const suggested = routes.find((route) => route.routeId === suggestedRouteId && !attempted.has(route.routeId));
    if (suggested) return suggested;
  }
  return routes.find((route) => !attempted.has(route.routeId));
}

function exceedsBudget(level: "low" | "medium" | "high" | undefined, budget: "low" | "medium" | "high" | undefined): boolean {
  if (!level || !budget) return false;
  const rank = { low: 1, medium: 2, high: 3 };
  return rank[level] > rank[budget];
}

function stop(
  reason: string,
  blockedReasons: string[],
  attemptNumber: number,
  routeId: string,
  createdAt: string,
  failureAnalysis?: AttemptDecision["failureAnalysis"],
): AttemptDecision {
  return { decision: "stop", reason, blockedReasons, shouldUpdateMemory: true, ...(failureAnalysis ? { failureAnalysis } : {}), attemptId: attemptId(attemptNumber), attemptNumber, routeId, createdAt };
}

function askHuman(
  reason: string,
  blockedReasons: string[],
  attemptNumber: number,
  routeId: string,
  createdAt: string,
  failureAnalysis?: AttemptDecision["failureAnalysis"],
): AttemptDecision {
  return { decision: "ask_human", reason, blockedReasons, shouldUpdateMemory: true, ...(failureAnalysis ? { failureAnalysis } : {}), attemptId: attemptId(attemptNumber), attemptNumber, routeId, createdAt };
}

function statusFor(decision: AttemptDecision["decision"]): WorkflowContext["adaptiveState"]["status"] {
  if (decision === "success") return "succeeded";
  if (decision === "retry" || decision === "revise_plan") return "retrying";
  if (decision === "ask_human") return "blocked";
  return "stopped";
}

function attemptId(attemptNumber: number): string {
  return `attempt-${String(attemptNumber).padStart(3, "0")}`;
}
