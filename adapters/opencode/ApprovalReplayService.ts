import { PolicyApprovalStore, type PolicyApprovalRecord } from "./PolicyApprovalStore.ts";
import { ToolCallHasher, type NormalizedToolCall } from "./ToolCallHasher.ts";

export type ReplayPlan = {
  decisionId: string;
  status: PolicyApprovalRecord["status"] | "missing";
  replayable: boolean;
  reason: string;
  toolCallHash: string | null;
  toolName: string | null;
  normalizedToolCall: NormalizedToolCall | null;
  command: string | null;
  affectedPaths: string[];
  projectRoot: string | null;
  expiresAt: string | null;
  consumedAt: string | null;
  replayCount: number;
  maxReplayCount: number;
};

export class ApprovalReplayService {
  private readonly approvals: PolicyApprovalStore;

  constructor(approvals = new PolicyApprovalStore()) {
    this.approvals = approvals;
  }

  loadApproval(decisionId: string): PolicyApprovalRecord {
    return this.approvals.getApproval(decisionId);
  }

  checkReplayable(decisionId: string, now = new Date()): ReplayPlan {
    return this.buildReplayPlan(decisionId, now);
  }

  verifyToolCallHash(approval: PolicyApprovalRecord): { valid: boolean; reason: string; recalculatedHash: string | null } {
    if (!approval.normalizedToolCall || !approval.toolCallHash) {
      return { valid: false, reason: "Approval does not include tool call integrity data.", recalculatedHash: null };
    }
    const recalculated = ToolCallHasher.hash({
      toolName: approval.normalizedToolCall.toolName,
      toolArgs: approval.normalizedToolCall.normalizedArgs,
      command: approval.normalizedToolCall.command,
      affectedPaths: approval.normalizedToolCall.affectedPaths,
      projectRoot: approval.normalizedToolCall.projectRoot,
    });
    if (recalculated.hash !== approval.toolCallHash) {
      return { valid: false, reason: "Stored tool call hash does not match normalized approval data.", recalculatedHash: recalculated.hash };
    }
    return { valid: true, reason: "Tool call hash matches approval data.", recalculatedHash: recalculated.hash };
  }

  consumeReplay(decisionId: string, replayDecisionId: string): ReturnType<PolicyApprovalStore["consumeForReplay"]> {
    const approval = this.loadApproval(decisionId);
    if (!approval.normalizedToolCall || !approval.toolCallHash) {
      return { approval, allowed: false, reason: "Approval does not include replay integrity data." };
    }
    return this.approvals.consumeForReplay(decisionId, {
      toolCallHash: approval.toolCallHash,
      normalizedToolCall: approval.normalizedToolCall,
    });
  }

  buildReplayPlan(decisionId: string, now = new Date()): ReplayPlan {
    let approval: PolicyApprovalRecord;
    try {
      approval = this.loadApproval(decisionId);
    } catch (error) {
      return emptyPlan(decisionId, "missing", error instanceof Error ? error.message : String(error));
    }

    const integrity = this.verifyToolCallHash(approval);
    const base = {
      decisionId,
      status: approval.status,
      toolCallHash: approval.toolCallHash,
      toolName: approval.toolName,
      normalizedToolCall: approval.normalizedToolCall,
      command: approval.command,
      affectedPaths: approval.affectedPaths,
      projectRoot: approval.normalizedToolCall?.projectRoot ?? null,
      expiresAt: approval.expiresAt,
      consumedAt: approval.consumedAt ?? null,
      replayCount: approval.status === "consumed" ? 1 : 0,
      maxReplayCount: 1,
    };

    if (approval.status === "pending") return { ...base, replayable: false, reason: "Approval is still pending." };
    if (approval.status === "rejected") return { ...base, replayable: false, reason: "Approval was rejected." };
    if (approval.status === "consumed") return { ...base, replayable: false, reason: "Approval was already consumed." };
    if (approval.status === "expired") return { ...base, replayable: false, reason: "Approval is expired." };
    if (approval.expiresAt && new Date(approval.expiresAt).getTime() < now.getTime()) {
      return { ...base, replayable: false, reason: "Approval is expired." };
    }
    if (!integrity.valid) return { ...base, replayable: false, reason: integrity.reason };
    if (!approval.normalizedToolCall) return { ...base, replayable: false, reason: "Approval does not include normalized tool call." };

    return { ...base, replayable: true, reason: "Approval can replay exactly once." };
  }
}

function emptyPlan(decisionId: string, status: "missing", reason: string): ReplayPlan {
  return {
    decisionId,
    status,
    replayable: false,
    reason,
    toolCallHash: null,
    toolName: null,
    normalizedToolCall: null,
    command: null,
    affectedPaths: [],
    projectRoot: null,
    expiresAt: null,
    consumedAt: null,
    replayCount: 0,
    maxReplayCount: 1,
  };
}
