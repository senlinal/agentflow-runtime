import type { AutonomyDecision } from "../types.ts";

export type EscalationGateResult = {
  shouldEscalate: boolean;
  shouldBlock: boolean;
  reason: string;
  questionsToAsk: AutonomyDecision["questionsToAsk"];
  blockedReasons: string[];
  nextAllowedActions: string[];
};

export class EscalationGate {
  evaluate(decision: AutonomyDecision): EscalationGateResult {
    const shouldEscalate = decision.mustAskHuman || decision.decision === "ask_human";
    const shouldBlock = !decision.canProceed || decision.decision === "blocked" || decision.decision === "stop";
    return {
      shouldEscalate,
      shouldBlock,
      reason: decision.reason,
      questionsToAsk: decision.questionsToAsk,
      blockedReasons: decision.blockedReasons,
      nextAllowedActions: decision.nextAllowedActions,
    };
  }
}
