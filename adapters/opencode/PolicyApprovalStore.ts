import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { writeJsonFile, type PolicyAuditRecord } from "./PolicyAuditLogger.ts";
import type { NormalizedToolCall } from "./ToolCallHasher.ts";

export type PolicyApprovalStatus = "pending" | "approved" | "rejected" | "consumed" | "expired";

export type PolicyApprovalRecord = {
  decisionId: string;
  status: PolicyApprovalStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy?: string;
  note?: string;
  expiresAt: string | null;
  consumedAt?: string;
  toolCallHash: string | null;
  normalizedToolCall: NormalizedToolCall | null;
  reason: string;
  riskLevel: string;
  matchedRule: string;
  toolName: string;
  command: string | null;
  affectedPaths: string[];
  suggestedSaferAlternative: string;
};

export class PolicyApprovalStore {
  readonly baseDir: string;

  constructor(baseDir = ".opencode/policy-runs") {
    this.baseDir = baseDir;
  }

  createPending(record: PolicyAuditRecord): { approval: PolicyApprovalRecord; path: string } {
    this.ensureDir();
    const approval: PolicyApprovalRecord = {
      decisionId: record.decisionId,
      status: "pending",
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      expiresAt: null,
      toolCallHash: record.toolCallHash,
      normalizedToolCall: record.toolCallHash
        ? {
            toolName: record.toolName,
            normalizedArgs: record.normalizedArgs,
            command: record.command,
            affectedPaths: record.affectedPaths,
            projectRoot: record.projectRoot,
          }
        : null,
      reason: record.reason,
      riskLevel: record.riskLevel,
      matchedRule: record.matchedRule,
      toolName: record.toolName,
      command: record.command,
      affectedPaths: record.affectedPaths,
      suggestedSaferAlternative: saferAlternative(record),
    };
    const path = this.pendingPath(record.decisionId);
    writeJsonFile(path, approval);
    return { approval, path };
  }

  listPending(): PolicyApprovalRecord[] {
    this.ensureDir();
    return readdirSync(this.pendingDir())
      .filter((file) => file.endsWith(".json"))
      .map((file) => JSON.parse(readFileSync(join(this.pendingDir(), file), "utf8")) as PolicyApprovalRecord)
      .filter((item) => item.status === "pending")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  getApproval(decisionId: string): PolicyApprovalRecord {
    const path = this.pendingPath(decisionId);
    if (!existsSync(path)) throw new Error(`Pending approval not found: ${decisionId}`);
    return JSON.parse(readFileSync(path, "utf8")) as PolicyApprovalRecord;
  }

  approve(decisionId: string, note = "", resolvedBy = "user"): PolicyApprovalRecord {
    return this.resolve(decisionId, "approved", note, resolvedBy);
  }

  reject(decisionId: string, note = "", resolvedBy = "user"): PolicyApprovalRecord {
    return this.resolve(decisionId, "rejected", note, resolvedBy);
  }

  consumeForReplay(
    decisionId: string,
    input: { toolCallHash: string; normalizedToolCall: NormalizedToolCall; now?: Date },
  ): { approval: PolicyApprovalRecord; allowed: boolean; reason: string } {
    const approval = this.getApproval(decisionId);
    const now = input.now ?? new Date();
    if (approval.status === "rejected") return { approval, allowed: false, reason: "Approval was rejected." };
    if (approval.status === "consumed") return { approval, allowed: false, reason: "Approval was already consumed." };
    if (approval.status !== "approved") return { approval, allowed: false, reason: `Approval status is ${approval.status}.` };
    if (approval.expiresAt && new Date(approval.expiresAt).getTime() < now.getTime()) {
      const expired = { ...approval, status: "expired" as const, resolvedAt: now.toISOString() };
      writeJsonFile(this.pendingPath(decisionId), expired);
      appendFileSync(this.path("approvals.jsonl"), `${JSON.stringify(expired)}\n`, "utf8");
      return { approval: expired, allowed: false, reason: "Approval expired." };
    }
    if (approval.toolCallHash !== input.toolCallHash) {
      return { approval, allowed: false, reason: "Tool call hash does not match approved request." };
    }
    if (!sameNormalizedToolCall(approval.normalizedToolCall, input.normalizedToolCall)) {
      return { approval, allowed: false, reason: "Tool call integrity fields do not match approved request." };
    }
    const consumed = {
      ...approval,
      status: "consumed" as const,
      consumedAt: now.toISOString(),
      resolvedAt: approval.resolvedAt ?? now.toISOString(),
    };
    writeJsonFile(this.pendingPath(decisionId), consumed);
    appendFileSync(this.path("approvals.jsonl"), `${JSON.stringify(consumed)}\n`, "utf8");
    return { approval: consumed, allowed: true, reason: "Approval replay matched and was consumed." };
  }

  private resolve(decisionId: string, status: "approved" | "rejected", note: string, resolvedBy: string): PolicyApprovalRecord {
    const approval = this.getApproval(decisionId);
    if (approval.status !== "pending") return approval;
    const resolvedAt = new Date();
    const resolved = {
      ...approval,
      status,
      resolvedAt: resolvedAt.toISOString(),
      resolvedBy,
      note,
      expiresAt: status === "approved" ? new Date(resolvedAt.getTime() + 15 * 60 * 1000).toISOString() : null,
    };
    appendFileSync(this.path("approvals.jsonl"), `${JSON.stringify(resolved)}\n`, "utf8");
    writeJsonFile(this.pendingPath(decisionId), resolved);
    return resolved;
  }

  ensureDir(): void {
    mkdirSync(this.baseDir, { recursive: true });
    mkdirSync(this.pendingDir(), { recursive: true });
  }

  path(file: string): string {
    return join(this.baseDir, file);
  }

  pendingDir(): string {
    return join(this.baseDir, "pending");
  }

  pendingPath(decisionId: string): string {
    return join(this.pendingDir(), `${decisionId}.json`);
  }
}

function sameNormalizedToolCall(left: NormalizedToolCall | null, right: NormalizedToolCall): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function saferAlternative(record: PolicyAuditRecord): string {
  if (record.matchedRule.includes("delete") || record.matchedRule.includes("rm-rf")) {
    return "Inspect the target path first, narrow the deletion target, or ask the user to approve the exact file list.";
  }
  if (record.matchedRule.includes("remote-script")) {
    return "Download the script, inspect it locally, then run only after explicit approval.";
  }
  if (record.matchedRule.includes("external-path")) {
    return "Keep operations inside the project directory or ask the user for explicit approval.";
  }
  return "Ask the user to approve or provide a lower-risk alternative.";
}
