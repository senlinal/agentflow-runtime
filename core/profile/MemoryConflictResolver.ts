import type { MemoryConflict, ProjectMemoryRecord } from "../types.ts";

export class MemoryConflictResolver {
  detect(records: ProjectMemoryRecord[]): MemoryConflict[] {
    return [
      ...detectConfirmedScopeConflicts(records),
      ...detectDecisionConflicts(records),
      ...detectDuplicateMemories(records),
    ];
  }
}

function detectConfirmedScopeConflicts(records: ProjectMemoryRecord[]): MemoryConflict[] {
  const scopes = records.filter((record) => record.type === "confirmed_scope" && record.status === "active");
  if (scopes.length <= 1) return [];
  const normalized = new Set(scopes.map((record) => normalize(record.summary)));
  if (normalized.size <= 1) return [];
  return [{
    conflictId: `memory_conflict_scope_${stableId(scopes.map((record) => record.memoryId).join("|"))}`,
    type: "confirmed_scope_conflict",
    severity: "high",
    summary: "Multiple active confirmed scopes disagree. Ask the human which scope is current before continuing.",
    conflictingMemoryIds: scopes.map((record) => record.memoryId),
    recommendedResolution: "ask_human",
  }];
}

function detectDecisionConflicts(records: ProjectMemoryRecord[]): MemoryConflict[] {
  const byTitle = new Map<string, ProjectMemoryRecord[]>();
  for (const record of records.filter((item) => item.type === "decision")) {
    const key = normalize(record.title);
    byTitle.set(key, [...(byTitle.get(key) ?? []), record]);
  }
  const conflicts: MemoryConflict[] = [];
  for (const group of byTitle.values()) {
    const statuses = new Set(group.map((record) => record.status));
    if (statuses.has("active") && statuses.has("rejected")) {
      conflicts.push({
        conflictId: `memory_conflict_decision_${stableId(group.map((record) => record.memoryId).join("|"))}`,
        type: "decision_conflict",
        severity: "medium",
        summary: `Decision "${group[0]?.title ?? "unknown"}" has both active and rejected records.`,
        conflictingMemoryIds: group.map((record) => record.memoryId),
        recommendedResolution: "ask_human",
      });
    }
  }
  return conflicts;
}

function detectDuplicateMemories(records: ProjectMemoryRecord[]): MemoryConflict[] {
  const byContent = new Map<string, ProjectMemoryRecord[]>();
  for (const record of records) {
    const key = [record.type, normalize(record.title), normalize(record.summary)].join("|");
    byContent.set(key, [...(byContent.get(key) ?? []), record]);
  }
  return [...byContent.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      conflictId: `memory_conflict_duplicate_${stableId(group.map((record) => record.memoryId).join("|"))}`,
      type: "duplicate_memory" as const,
      severity: "low" as const,
      summary: `Duplicate memory records found for "${group[0]?.title ?? "unknown"}".`,
      conflictingMemoryIds: group.map((record) => record.memoryId),
      recommendedResolution: "archive_duplicate" as const,
    }));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function stableId(value: string): string {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash.toString(16);
}
