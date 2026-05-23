import type { PatchExportRecord } from "../types.ts";
import { truncateAndRedact } from "../SecretRedactor.ts";

export type PatchExportFormat = "text" | "json";

export function formatPatchExportList(records: PatchExportRecord[], format: PatchExportFormat = "text"): string {
  if (format === "json") return `${JSON.stringify(records, null, 2)}\n`;
  if (records.length === 0) return "No patch exports found.\n";
  return `${records.map((record) => [
    record.createdAt,
    record.patchExportId,
    `execution=${record.executionId}`,
    `safe=${record.safeToApplyManually}`,
    `verification=${record.verificationPass === undefined ? "n/a" : record.verificationPass ? "passed" : "failed"}`,
    `changed=${record.changedFiles.join(",") || "none"}`,
    `hash=${record.patchHash}`,
    `patch=${record.patchPath}`,
    `metadata=${record.metadataPath}`,
    `applyGuide=${record.applyGuidePath}`,
  ].join("\t")).join("\n")}\n`;
}

export function formatPatchExportRecord(record: PatchExportRecord, format: PatchExportFormat = "text"): string {
  if (format === "json") return `${JSON.stringify(record, null, 2)}\n`;
  return [
    `Patch Export ${record.patchExportId}`,
    "",
    `executionId: ${record.executionId}`,
    `patchHash: ${record.patchHash}`,
    `safeToApplyManually: ${record.safeToApplyManually}`,
    `verificationPass: ${record.verificationPass ?? "n/a"}`,
    `testStatus: ${record.testStatus ?? "n/a"}`,
    `changedFiles: ${record.changedFiles.join("; ") || "none"}`,
    `filesAdded: ${record.filesAdded.join("; ") || "none"}`,
    `filesModified: ${record.filesModified.join("; ") || "none"}`,
    `filesDeleted: ${record.filesDeleted.join("; ") || "none"}`,
    `insertions: ${record.insertions ?? 0}`,
    `deletions: ${record.deletions ?? 0}`,
    `patchPath: ${record.patchPath}`,
    `metadataPath: ${record.metadataPath}`,
    `applyGuidePath: ${record.applyGuidePath}`,
    `warnings: ${record.warnings.join("; ") || "none"}`,
    "",
    "This command only displays patch export metadata. It does not apply the patch.",
    "",
  ].map((line) => truncateAndRedact(line, 2_000)).join("\n");
}
