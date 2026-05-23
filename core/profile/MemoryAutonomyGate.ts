import type { AutonomyDecision, CompactMemorySummary, TaskBrief } from "../types.ts";

export type MemoryAutonomyGateInput = {
  taskBrief: TaskBrief;
  compactMemory?: CompactMemorySummary | null;
  proposedAction?: string;
  dryRun?: boolean;
};

export class MemoryAutonomyGate {
  evaluate(input: MemoryAutonomyGateInput): AutonomyDecision {
    const proposedAction = normalize([input.proposedAction, input.taskBrief.goal, input.taskBrief.rawUserInput].filter(Boolean).join(" "));
    const memory = input.compactMemory;
    const blockedReasons: string[] = [];
    const safetyFindings: string[] = [];
    const assumptions: string[] = [];
    const referencedMemoryIds = new Set<string>();
    const questionsToAsk: AutonomyDecision["questionsToAsk"] = [];
    const nextAllowedActions = new Set<string>([
      "read_context",
      "summarize_memory",
      "ask_clarifying_question",
      "run_task_negotiation",
    ]);

    if (!memory) {
      assumptions.push("No compacted memory summary is available; proceed only with profile policy and current TaskBrief.");
      if (input.dryRun) nextAllowedActions.add("dry_run_profile_chain");
      return decision({
        decision: "proceed_with_assumptions",
        reason: "No compacted memory was found. Low-risk profile preflight may continue with explicit assumptions.",
        confidence: "medium",
        canProceed: true,
        mustAskHuman: false,
        assumptions,
        questionsToAsk,
        blockedReasons,
        safetyFindings,
        referencedMemoryIds,
        nextAllowedActions,
      });
    }

    for (const conflict of memory.conflicts) {
      for (const memoryId of conflict.conflictingMemoryIds) referencedMemoryIds.add(memoryId);
      if (conflict.severity === "high") {
        questionsToAsk.push({
          question: `Resolve memory conflict before continuing: ${conflict.summary}`,
          reason: `Conflict ${conflict.conflictId} is high severity and recommends ${conflict.recommendedResolution}.`,
          blocking: true,
          relatedMemoryIds: conflict.conflictingMemoryIds,
        });
        blockedReasons.push(`High severity memory conflict: ${conflict.summary}`);
      } else if (conflict.severity === "medium") {
        safetyFindings.push(`Medium memory conflict requires caution: ${conflict.summary}`);
      }
    }

    for (const question of memory.openQuestions) {
      for (const memoryId of question.sourceMemoryIds) referencedMemoryIds.add(memoryId);
      if (question.blocking) {
        questionsToAsk.push({
          question: question.question,
          reason: "Open project-memory question is marked blocking.",
          blocking: true,
          relatedMemoryIds: question.sourceMemoryIds,
        });
        blockedReasons.push(`Blocking open question: ${question.question}`);
      } else {
        questionsToAsk.push({
          question: question.question,
          reason: "Open project-memory question should be answered when convenient.",
          blocking: false,
          relatedMemoryIds: question.sourceMemoryIds,
        });
      }
    }

    for (const route of memory.rejectedRoutes) {
      for (const memoryId of route.sourceMemoryIds) referencedMemoryIds.add(memoryId);
      if (route.doNotRepeatWithoutNewEvidence && actionMentionsRoute(proposedAction, route)) {
        blockedReasons.push(`Rejected route would be repeated without new evidence: ${route.name}`);
        safetyFindings.push(`Do not repeat route ${route.name}: ${route.reason}`);
      }
    }

    const scope = memory.confirmedScope;
    if (scope) {
      for (const memoryId of scope.sourceMemoryIds) referencedMemoryIds.add(memoryId);
      for (const action of scope.allowedActions) nextAllowedActions.add(action);
      for (const blockedAction of scope.blockedActions) {
        if (mentionsBlockedAction(proposedAction, blockedAction)) {
          blockedReasons.push(`Proposed action conflicts with confirmed blocked action: ${blockedAction}`);
        }
      }
      for (const forbiddenModule of scope.forbiddenModules) {
        if (forbiddenModule && proposedAction.includes(normalize(forbiddenModule))) {
          blockedReasons.push(`Proposed action touches forbidden module from confirmed scope: ${forbiddenModule}`);
        }
      }
    } else {
      assumptions.push("No confirmed scope exists in compacted memory; stay in negotiation or scope confirmation before execution.");
      nextAllowedActions.add("create_scope_confirmation");
    }

    for (const action of memory.nextActions) {
      for (const memoryId of action.sourceMemoryIds) referencedMemoryIds.add(memoryId);
      if (action.blockedBy.length === 0) nextAllowedActions.add(action.action);
    }

    if (blockedReasons.some((reason) => /rejected route/i.test(reason))) {
      return decision({
        decision: "blocked",
        reason: "The proposed action repeats a rejected route without new evidence.",
        confidence: "high",
        canProceed: false,
        mustAskHuman: false,
        assumptions,
        questionsToAsk,
        blockedReasons,
        safetyFindings,
        referencedMemoryIds,
        nextAllowedActions,
      });
    }

    if (blockedReasons.length > 0) {
      return decision({
        decision: "ask_human",
        reason: "Memory indicates unresolved conflicts, blocking questions, or confirmed scope boundaries.",
        confidence: "high",
        canProceed: false,
        mustAskHuman: true,
        assumptions,
        questionsToAsk,
        blockedReasons,
        safetyFindings,
        referencedMemoryIds,
        nextAllowedActions,
      });
    }

    if (questionsToAsk.some((question) => !question.blocking)) {
      assumptions.push("Non-blocking memory questions remain open; proceed only within confirmed scope and record assumptions.");
      return decision({
        decision: "proceed_with_assumptions",
        reason: "Only non-blocking memory questions remain. Low-risk work can continue with explicit assumptions.",
        confidence: "medium",
        canProceed: true,
        mustAskHuman: false,
        assumptions,
        questionsToAsk,
        blockedReasons,
        safetyFindings,
        referencedMemoryIds,
        nextAllowedActions,
      });
    }

    return decision({
      decision: "proceed",
      reason: "Compacted memory has no blocking conflicts, rejected-route repeat, or blocking open question for this action.",
      confidence: memory.confirmedScope ? "high" : "medium",
      canProceed: true,
      mustAskHuman: false,
      assumptions,
      questionsToAsk,
      blockedReasons,
      safetyFindings,
      referencedMemoryIds,
      nextAllowedActions,
    });
  }
}

function decision(input: {
  decision: AutonomyDecision["decision"];
  reason: string;
  confidence: AutonomyDecision["confidence"];
  canProceed: boolean;
  mustAskHuman: boolean;
  assumptions: string[];
  questionsToAsk: AutonomyDecision["questionsToAsk"];
  blockedReasons: string[];
  safetyFindings: string[];
  referencedMemoryIds: Set<string>;
  nextAllowedActions: Set<string>;
}): AutonomyDecision {
  return {
    decision: input.decision,
    reason: input.reason,
    confidence: input.confidence,
    canProceed: input.canProceed,
    mustAskHuman: input.mustAskHuman,
    assumptions: [...new Set(input.assumptions)],
    questionsToAsk: input.questionsToAsk,
    blockedReasons: [...new Set(input.blockedReasons)],
    safetyFindings: [...new Set(input.safetyFindings)],
    referencedMemoryIds: [...input.referencedMemoryIds],
    nextAllowedActions: [...input.nextAllowedActions],
    createdAt: new Date().toISOString(),
  };
}

function actionMentionsRoute(action: string, route: CompactMemorySummary["rejectedRoutes"][number]): boolean {
  const routeName = normalize(route.name);
  const routeReason = normalize(route.reason);
  const importantTerms = routeName.split(/\s+/).filter((term) => term.length > 3);
  if (routeName && action.includes(routeName)) return true;
  if (routeReason && action.includes(routeReason)) return true;
  return importantTerms.some((term) => action.includes(term));
}

function mentionsBlockedAction(action: string, blockedAction: string): boolean {
  const normalized = normalize(blockedAction).replace(/_/g, " ");
  if (!normalized) return false;
  return action.includes(normalized) || action.includes(normalized.replace(/\s+/g, "_"));
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}
