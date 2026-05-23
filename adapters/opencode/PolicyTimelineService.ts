import { join } from "node:path";
import { PolicyLogReader, type PolicyLogWarning } from "./PolicyLogReader.ts";

export type PolicyTimelineEvent = {
  type: "decision" | "approval" | "replay" | "pending" | "consumed";
  timestamp: string | null;
  decisionId?: string;
  replayId?: string;
  action?: string;
  status?: string;
  riskLevel?: string;
  matchedRule?: string;
  reason?: string;
  toolName?: string;
  command?: string | null;
  affectedPaths: string[];
  sourceFile: string;
  exitCode?: number | null;
  mode?: string;
};

export type PolicyTimeline = {
  rootDecisionId: string;
  toolCallHash: string | null;
  status: "pending" | "approved" | "rejected" | "consumed" | "denied" | "unknown";
  summary: string;
  events: PolicyTimelineEvent[];
  relatedDecisionIds: string[];
  relatedReplayIds: string[];
  pendingApprovalPath: string | null;
  warnings: PolicyLogWarning[];
};

export class PolicyTimelineService {
  private readonly reader: PolicyLogReader;
  private readonly policyDir: string;

  constructor(policyDir = ".opencode/policy-runs", reader = new PolicyLogReader()) {
    this.policyDir = policyDir;
    this.reader = reader;
  }

  buildTimeline(decisionId: string): PolicyTimeline {
    const logs = this.reader.readPolicyRuns(this.policyDir);
    const decisions = logs.decisions.filter((item) =>
      item.decisionId === decisionId || item.replayOfDecisionId === decisionId
    );
    const approvals = logs.approvals.filter((item) => item.decisionId === decisionId);
    const replays = logs.replays.filter((item) => item.originalDecisionId === decisionId);
    const pending = logs.pending.filter((item) => item.decisionId === decisionId);

    if (decisions.length === 0 && approvals.length === 0 && replays.length === 0 && pending.length === 0) {
      throw new Error(`Policy decision not found: ${decisionId}`);
    }

    const events: PolicyTimelineEvent[] = [
      ...decisions.map((item) => decisionEvent(item)),
      ...approvals.map((item) => approvalEvent(item)),
      ...replays.map((item) => replayEvent(item)),
      ...pending.map((item) => pendingEvent(item)),
    ];

    const warnings = [...logs.warnings];
    for (const event of events) {
      if (!event.timestamp) {
        warnings.push({ filePath: event.sourceFile, message: `Missing timestamp for ${event.type} event.` });
      }
    }
    events.sort(compareEvents);

    const latestApproval = approvals[approvals.length - 1] ?? pending[pending.length - 1];
    const rootDecision = decisions.find((item) => item.decisionId === decisionId);
    const status = timelineStatus(rootDecision, latestApproval, replays);
    const toolCallHash = stringValue(rootDecision?.toolCallHash ?? latestApproval?.toolCallHash ?? replays[0]?.toolCallHash);
    const relatedDecisionIds = [...new Set(events.map((event) => event.decisionId).filter(isString))];
    const relatedReplayIds = [...new Set(events.map((event) => event.replayId).filter(isString))];
    const pendingApprovalPath = pending.some((item) => item.status === "pending")
      ? join(this.policyDir, "pending", `${decisionId}.json`)
      : null;

    return {
      rootDecisionId: decisionId,
      toolCallHash,
      status,
      summary: `Policy ${decisionId} is ${status} with ${events.length} event(s).`,
      events,
      relatedDecisionIds,
      relatedReplayIds,
      pendingApprovalPath,
      warnings,
    };
  }
}

export function formatPolicyTimelineText(timeline: PolicyTimeline): string {
  const root = timeline.events.find((event) => event.decisionId === timeline.rootDecisionId);
  return [
    `Policy Replay History: ${timeline.rootDecisionId}`,
    "",
    `Status: ${timeline.status}`,
    `Tool: ${root?.toolName ?? "n/a"}`,
    `Command: ${root?.command ?? "n/a"}`,
    `Risk: ${root?.riskLevel ?? "n/a"}`,
    `Hash: ${timeline.toolCallHash ?? "n/a"}`,
    "",
    "Timeline:",
    ...timeline.events.map(formatEvent),
    timeline.warnings.length > 0 ? "\nWarnings:" : "",
    ...timeline.warnings.map((warning) =>
      `- ${warning.filePath}${warning.line ? `:${warning.line}` : ""} ${warning.message}`
    ),
  ].filter((line) => line !== "").join("\n");
}

function decisionEvent(item: Record<string, unknown>): PolicyTimelineEvent {
  return {
    type: "decision",
    timestamp: stringValue(item.timestamp),
    decisionId: stringValue(item.decisionId) ?? undefined,
    action: stringValue(item.action) ?? undefined,
    riskLevel: stringValue(item.riskLevel) ?? undefined,
    matchedRule: stringValue(item.matchedRule) ?? undefined,
    reason: stringValue(item.reason) ?? undefined,
    toolName: stringValue(item.toolName) ?? undefined,
    command: stringValue(item.command),
    affectedPaths: arrayValue(item.affectedPaths),
    sourceFile: "decisions.jsonl",
  };
}

function approvalEvent(item: Record<string, unknown>): PolicyTimelineEvent {
  const status = stringValue(item.status);
  return {
    type: status === "consumed" ? "consumed" : "approval",
    timestamp: stringValue(status === "consumed" ? item.consumedAt ?? item.resolvedAt : item.resolvedAt ?? item.createdAt),
    decisionId: stringValue(item.decisionId) ?? undefined,
    status: status ?? undefined,
    riskLevel: stringValue(item.riskLevel) ?? undefined,
    matchedRule: stringValue(item.matchedRule) ?? undefined,
    reason: stringValue(item.note ?? item.reason) ?? undefined,
    toolName: stringValue(item.toolName) ?? undefined,
    command: stringValue(item.command),
    affectedPaths: arrayValue(item.affectedPaths),
    sourceFile: "approvals.jsonl",
  };
}

function replayEvent(item: Record<string, unknown>): PolicyTimelineEvent {
  return {
    type: "replay",
    timestamp: stringValue(item.timestamp),
    decisionId: stringValue(item.originalDecisionId) ?? undefined,
    replayId: stringValue(item.replayId) ?? undefined,
    status: stringValue(item.status) ?? undefined,
    reason: stringValue(item.reason) ?? undefined,
    command: stringValue(item.command),
    affectedPaths: arrayValue(item.affectedPaths),
    sourceFile: "replays.jsonl",
    exitCode: typeof item.exitCode === "number" ? item.exitCode : null,
    mode: stringValue(item.mode) ?? undefined,
  };
}

function pendingEvent(item: Record<string, unknown>): PolicyTimelineEvent {
  return {
    type: "pending",
    timestamp: stringValue(item.createdAt),
    decisionId: stringValue(item.decisionId) ?? undefined,
    status: stringValue(item.status) ?? undefined,
    riskLevel: stringValue(item.riskLevel) ?? undefined,
    matchedRule: stringValue(item.matchedRule) ?? undefined,
    reason: stringValue(item.reason) ?? undefined,
    toolName: stringValue(item.toolName) ?? undefined,
    command: stringValue(item.command),
    affectedPaths: arrayValue(item.affectedPaths),
    sourceFile: `pending/${stringValue(item.decisionId) ?? "unknown"}.json`,
  };
}

function formatEvent(event: PolicyTimelineEvent): string {
  const label = event.type === "decision"
    ? String(event.action ?? "decision").toUpperCase()
    : event.type === "approval"
      ? String(event.status ?? "approval").toUpperCase()
      : event.type.toUpperCase();
  const id = event.replayId ?? event.decisionId ?? "n/a";
  const details = [
    event.matchedRule ? `matchedRule=${event.matchedRule}` : null,
    event.mode ? `mode=${event.mode}` : null,
    event.status ? `status=${event.status}` : null,
    typeof event.exitCode === "number" ? `exitCode=${event.exitCode}` : null,
    event.reason ? `reason="${event.reason}"` : null,
  ].filter(Boolean).join(" ");
  return `[${event.timestamp ?? "no-timestamp"}] ${label.padEnd(8)} ${id} ${details}`.trim();
}

function timelineStatus(
  rootDecision: Record<string, unknown> | undefined,
  latestApproval: Record<string, unknown> | undefined,
  replays: Record<string, unknown>[],
): PolicyTimeline["status"] {
  if (rootDecision?.action === "deny") return "denied";
  const latestStatus = stringValue(latestApproval?.status);
  if (latestStatus === "consumed") return "consumed";
  if (latestStatus === "rejected") return "rejected";
  if (latestStatus === "approved") return "approved";
  if (latestStatus === "pending") return "pending";
  if (replays.some((item) => item.status === "executed")) return "consumed";
  return "unknown";
}

function compareEvents(left: PolicyTimelineEvent, right: PolicyTimelineEvent): number {
  if (!left.timestamp && !right.timestamp) return 0;
  if (!left.timestamp) return 1;
  if (!right.timestamp) return -1;
  return left.timestamp.localeCompare(right.timestamp);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isString) : [];
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
