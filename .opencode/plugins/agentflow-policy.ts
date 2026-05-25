import { OpenCodePolicyService } from "../../adapters/opencode/OpenCodePolicyService.ts";

const policy = new OpenCodePolicyService();

export async function AgentFlowPolicy() {
  return {
    name: "agentflow-policy",
    async config() {},
    async "tool.execute.before"(input: unknown) {
      const call = normalizeToolCall(input);
      const decision = policy.evaluateToolCall(call);
      if (decision.action === "allow") return { allow: true, decision };

      const message = `[agentflow-policy] ${decision.action.toUpperCase()}: ${decision.reason}`;
      const app = (input as { app?: { tui?: { toast?: { show?: (message: string) => void } } } } | null)?.app;
      app?.tui?.toast?.show?.(message);

      return {
        allow: false,
        action: decision.action,
        decisionId: decision.decisionId,
        reason: decision.reason,
        matchedRule: decision.matchedRule,
        affectedPaths: decision.affectedPaths,
        pendingApprovalPath: decision.pendingApprovalPath,
        decision,
        message,
      };
    },
  };
}

function normalizeToolCall(input: unknown): { tool: string; args: Record<string, unknown> } {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const tool = String(record.tool ?? record.name ?? record.toolName ?? "");
  const args = record.args && typeof record.args === "object"
    ? record.args as Record<string, unknown>
    : record.input && typeof record.input === "object"
      ? record.input as Record<string, unknown>
      : record;
  return { tool, args };
}
