import type { ProjectMemoryRecord, ProjectMemorySummary } from "../types.ts";

export function formatProjectMemories(records: ProjectMemoryRecord[], format: "text" | "json" = "text"): string {
  if (format === "json") return JSON.stringify(records, null, 2);
  if (records.length === 0) return "No project memory records found.";
  return records.map((record) => [
    `memoryId: ${record.memoryId}`,
    `profileId: ${record.profileId}`,
    `type: ${record.type}`,
    `status: ${record.status}`,
    `title: ${record.title}`,
    `summary: ${record.summary}`,
    `tags: ${record.tags.join(", ") || "none"}`,
    `source: ${formatSource(record)}`,
    `createdAt: ${record.createdAt}`,
    `updatedAt: ${record.updatedAt ?? "n/a"}`,
  ].join("\n")).join("\n\n");
}

export function formatProjectMemory(record: ProjectMemoryRecord, format: "text" | "json" = "text"): string {
  if (format === "json") return JSON.stringify(record, null, 2);
  return formatProjectMemories([record], "text");
}

export function formatProjectMemorySummary(summary: ProjectMemorySummary, format: "text" | "json" = "text"): string {
  if (format === "json") return JSON.stringify(summary, null, 2);
  return [
    `profileId: ${summary.profileId}`,
    `generatedAt: ${summary.generatedAt}`,
    `records: ${summary.records.length}`,
    `activeConfirmedScopes: ${summary.activeConfirmedScopes.map((record) => record.title).join(" | ") || "none"}`,
    `triedRoutes: ${summary.triedRoutes.map((record) => record.title).join(" | ") || "none"}`,
    `rejectedRoutes: ${summary.rejectedRoutes.map((record) => record.title).join(" | ") || "none"}`,
    `nextActions: ${summary.nextActions.map((record) => record.summary).join(" | ") || "none"}`,
    `warnings: ${summary.warnings.join("; ") || "none"}`,
  ].join("\n");
}

function formatSource(record: ProjectMemoryRecord): string {
  if (!record.source) return "n/a";
  return Object.entries(record.source)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}=${value}`)
    .join(", ") || "n/a";
}
