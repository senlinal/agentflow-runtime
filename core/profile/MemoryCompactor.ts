import type { CompactMemorySummary, ConfirmedScopeMemory, ProjectMemoryRecord } from "../types.ts";
import { MemoryConflictResolver } from "./MemoryConflictResolver.ts";

export class MemoryCompactor {
  private readonly conflictResolver: MemoryConflictResolver;

  constructor(conflictResolver = new MemoryConflictResolver()) {
    this.conflictResolver = conflictResolver;
  }

  compact(profileId: string, records: ProjectMemoryRecord[]): CompactMemorySummary {
    const scoped = records
      .filter((record) => record.profileId === profileId)
      .sort((left, right) => (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt));
    const conflicts = this.conflictResolver.detect(scoped);
    const latestConfirmedScope = scoped.find((record) => record.type === "confirmed_scope" && record.status === "active");
    const activeDecisions = uniqueByTitle(scoped.filter((record) => record.type === "decision" && record.status === "active"));
    const currentFacts = uniqueByTitle(scoped.filter((record) =>
      ["confirmed_scope", "current_best", "progress_summary"].includes(record.type) && record.status === "active"
    ));
    const rejectedRoutes = uniqueByTitle(scoped.filter((record) => record.type === "rejected_route" && record.status === "active"));
    const candidateRoutes = uniqueByTitle(scoped.filter((record) => record.type === "tried_route" && record.status === "active"));
    const openQuestions = uniqueByTitle(scoped.filter((record) => record.type === "open_question" && record.status === "active"));
    const resolvedQuestions = uniqueByTitle(scoped.filter((record) => record.type === "open_question" && record.status === "resolved"));
    const nextActions = uniqueByTitle(scoped.filter((record) => record.type === "next_action" && record.status === "active"));

    return {
      profileId,
      compactedAt: new Date().toISOString(),
      ...(latestConfirmedScope ? { confirmedScope: toConfirmedScopeMemory(latestConfirmedScope) } : {}),
      currentFacts: currentFacts.map((record) => ({
        id: `fact_${stableId(record.memoryId)}`,
        title: record.title,
        summary: record.summary,
        sourceMemoryIds: [record.memoryId],
        confidence: record.type === "confirmed_scope" ? "high" : "medium",
      })),
      activeDecisions: activeDecisions.map((record) => ({
        id: `decision_${stableId(record.memoryId)}`,
        title: record.title,
        summary: record.summary,
        sourceMemoryIds: [record.memoryId],
      })),
      rejectedRoutes: rejectedRoutes.map((record) => ({
        routeId: `rejected_route_${stableId(record.memoryId)}`,
        name: record.title,
        reason: record.summary,
        doNotRepeatWithoutNewEvidence: true,
        sourceMemoryIds: [record.memoryId],
      })),
      candidateRoutes: candidateRoutes.map((record) => ({
        routeId: `candidate_route_${stableId(record.memoryId)}`,
        name: record.title,
        hypothesis: record.summary,
        evidence: record.source?.workflowRunId ? [`workflowRunId=${record.source.workflowRunId}`] : [],
        sourceMemoryIds: [record.memoryId],
      })),
      openQuestions: openQuestions.map((record) => ({
        id: `open_question_${stableId(record.memoryId)}`,
        question: record.summary,
        blocking: record.tags.includes("blocking"),
        sourceMemoryIds: [record.memoryId],
      })),
      resolvedQuestions: resolvedQuestions.map((record) => ({
        id: `resolved_question_${stableId(record.memoryId)}`,
        question: record.title,
        answerSummary: record.summary,
        sourceMemoryIds: [record.memoryId],
      })),
      nextActions: nextActions.map((record) => ({
        id: `next_action_${stableId(record.memoryId)}`,
        action: record.summary,
        priority: record.tags.includes("high-priority") ? "high" : "medium",
        blockedBy: conflicts.filter((conflict) => conflict.severity === "high").map((conflict) => conflict.conflictId),
        sourceMemoryIds: [record.memoryId],
      })),
      conflicts,
      warnings: conflicts
        .filter((conflict) => conflict.severity === "high")
        .map((conflict) => conflict.summary),
    };
  }
}

function toConfirmedScopeMemory(record: ProjectMemoryRecord): ConfirmedScopeMemory {
  return {
    id: `confirmed_scope_${stableId(record.memoryId)}`,
    title: record.title,
    summary: record.summary,
    sourceMemoryIds: [record.memoryId],
    allowedModules: parseList(record.summary, "Allowed modules"),
    forbiddenModules: parseList(record.summary, "Forbidden modules"),
    allowedActions: parseList(record.summary, "Allowed actions"),
    blockedActions: parseList(record.summary, "Blocked actions"),
    qualityConstraints: parseList(record.summary, "Quality constraints"),
  };
}

function parseList(summary: string, label: string): string[] {
  const part = summary.split("|").map((item) => item.trim()).find((item) => item.toLowerCase().startsWith(label.toLowerCase()));
  if (!part) return [];
  const value = part.slice(part.indexOf(":") + 1).trim();
  if (!value || value === "none") return [];
  return value.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
}

function uniqueByTitle(records: ProjectMemoryRecord[]): ProjectMemoryRecord[] {
  const seen = new Set<string>();
  const result: ProjectMemoryRecord[] = [];
  for (const record of records) {
    const key = `${record.type}:${record.title.toLowerCase().trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(record);
  }
  return result;
}

function stableId(value: string): string {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash.toString(16);
}
