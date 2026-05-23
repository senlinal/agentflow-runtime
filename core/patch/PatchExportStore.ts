import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PatchExportRecord } from "../types.ts";
import { truncateAndRedact } from "../SecretRedactor.ts";

export type PatchExportInput = {
  executionId: string;
  sourceProjectPath: string;
  workspaceRoot: string;
  patchText: string;
  changedFiles: string[];
  filesAdded: string[];
  filesModified: string[];
  filesDeleted: string[];
  testStatus?: string;
  verificationPass?: boolean;
  warnings?: string[];
};

export type PatchExportSaveResult = {
  record: PatchExportRecord;
  patchPath: string;
  metadataPath: string;
  applyGuidePath: string;
};

export type PatchExportFilters = {
  executionId?: string;
  safeToApplyManually?: boolean;
  limit?: number;
};

export class PatchExportStore {
  private readonly baseDir: string;

  constructor(baseDir = ".agentflow/patch-exports") {
    this.baseDir = baseDir;
  }

  async save(input: PatchExportInput): Promise<PatchExportSaveResult> {
    await this.ensureDirs();
    const patchExportId = `patch_export_${shortHash(`${input.executionId}:${input.patchText}:${Date.now()}`)}`;
    const exportDir = join(this.baseDir, "exports", patchExportId);
    await mkdir(exportDir, { recursive: true });

    const patchPath = join(exportDir, "changes.patch");
    const metadataPath = join(exportDir, "metadata.json");
    const applyGuidePath = join(exportDir, "APPLY_GUIDE.md");
    const stats = countPatchStats(input.patchText);
    const warnings = [
      ...(input.warnings ?? []),
      ...(input.filesDeleted.length > 0 ? ["Patch contains deleted files; manual apply is not marked safe."] : []),
      ...(input.patchText.trim().length === 0 ? ["Patch is empty."] : []),
    ];
    const safeToApplyManually = input.patchText.trim().length > 0 && input.filesDeleted.length === 0 && input.verificationPass === true;
    const record: PatchExportRecord = sanitizeRecord({
      patchExportId,
      executionId: input.executionId,
      sourceProjectPath: input.sourceProjectPath,
      workspaceRoot: input.workspaceRoot,
      patchPath,
      metadataPath,
      applyGuidePath,
      patchHash: `sha256:${hash(input.patchText)}`,
      changedFiles: input.changedFiles,
      filesAdded: input.filesAdded,
      filesModified: input.filesModified,
      filesDeleted: input.filesDeleted,
      insertions: stats.insertions,
      deletions: stats.deletions,
      testStatus: input.testStatus,
      verificationPass: input.verificationPass,
      createdAt: new Date().toISOString(),
      safeToApplyManually,
      warnings,
    });

    await writeFile(patchPath, input.patchText, "utf8");
    await writeFile(metadataPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await writeFile(applyGuidePath, buildApplyGuide(record), "utf8");
    await appendFile(join(this.baseDir, "patch-exports.jsonl"), `${JSON.stringify(toSummary(record))}\n`, "utf8");
    return { record, patchPath, metadataPath, applyGuidePath };
  }

  async list(filters: PatchExportFilters = {}): Promise<PatchExportRecord[]> {
    await this.ensureDirs();
    const text = await readFile(join(this.baseDir, "patch-exports.jsonl"), "utf8").catch((error: unknown) => {
      if (isNotFound(error)) return "";
      throw error;
    });
    const records = text
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line, index) => {
        try {
          return JSON.parse(line) as PatchExportRecord;
        } catch (error) {
          throw new Error(`Failed to parse patch export summary at patch-exports.jsonl:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
        }
      })
      .filter((record) => !filters.executionId || record.executionId === filters.executionId)
      .filter((record) => filters.safeToApplyManually === undefined || record.safeToApplyManually === filters.safeToApplyManually)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return typeof filters.limit === "number" ? records.slice(0, filters.limit) : records;
  }

  async get(patchExportId: string): Promise<PatchExportRecord> {
    const text = await readFile(join(this.baseDir, "exports", patchExportId, "metadata.json"), "utf8").catch((error: unknown) => {
      if (isNotFound(error)) throw new Error(`Patch export not found: ${patchExportId}`);
      throw error;
    });
    return JSON.parse(text) as PatchExportRecord;
  }

  async readApplyGuide(patchExportId: string): Promise<string> {
    const record = await this.get(patchExportId);
    return readFile(record.applyGuidePath, "utf8").catch((error: unknown) => {
      if (isNotFound(error)) throw new Error(`Apply guide not found for patch export: ${patchExportId}`);
      throw error;
    });
  }

  private async ensureDirs(): Promise<void> {
    await mkdir(join(this.baseDir, "exports"), { recursive: true });
  }
}

export function buildApplyGuide(record: PatchExportRecord): string {
  const warnings = record.warnings.length > 0
    ? record.warnings.map((warning) => `- ${warning}`).join("\n")
    : "- none";
  return [
    `# Patch Apply Guide: ${record.patchExportId}`,
    "",
    "This guide is informational. AgentFlow did not write this patch back to the source project and did not run `git apply`.",
    "",
    "## Patch Metadata",
    "",
    `- executionId: ${record.executionId}`,
    `- patchHash: ${record.patchHash}`,
    `- safeToApplyManually: ${record.safeToApplyManually}`,
    `- verificationPass: ${record.verificationPass ?? "n/a"}`,
    `- testStatus: ${record.testStatus ?? "n/a"}`,
    `- changedFiles: ${record.changedFiles.join("; ") || "none"}`,
    `- filesAdded: ${record.filesAdded.join("; ") || "none"}`,
    `- filesModified: ${record.filesModified.join("; ") || "none"}`,
    `- filesDeleted: ${record.filesDeleted.join("; ") || "none"}`,
    `- insertions: ${record.insertions ?? 0}`,
    `- deletions: ${record.deletions ?? 0}`,
    "",
    "## Manual Review Steps",
    "",
    "1. Review the patch file manually.",
    "2. Confirm the patch hash matches the metadata.",
    "3. From the original project root, run `git apply --check <patchPath>` yourself if you choose to validate it.",
    "4. If the check passes and you accept the change, apply it manually with your own git workflow.",
    "5. Run the project tests manually after applying.",
    "",
    "## Paths",
    "",
    `- sourceProjectPath: ${record.sourceProjectPath}`,
    `- copiedWorkspaceRoot: ${record.workspaceRoot}`,
    `- patchPath: ${record.patchPath}`,
    `- metadataPath: ${record.metadataPath}`,
    `- applyGuidePath: ${record.applyGuidePath}`,
    "",
    "## Warnings",
    "",
    warnings,
    "",
    "AgentFlow does not automatically apply patches to source projects.",
    "",
  ].map((line) => truncateAndRedact(line, 2_000)).join("\n");
}

function toSummary(record: PatchExportRecord): PatchExportRecord {
  return record;
}

function sanitizeRecord(record: PatchExportRecord): PatchExportRecord {
  return sanitizeUnknown(record) as PatchExportRecord;
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === "string") return truncateAndRedact(value, 8_000);
  if (Array.isArray(value)) return value.map(sanitizeUnknown);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) result[key] = sanitizeUnknown(item);
  return result;
}

function countPatchStats(patchText: string): { insertions: number; deletions: number } {
  let insertions = 0;
  let deletions = 0;
  for (const line of patchText.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) insertions += 1;
    if (line.startsWith("-")) deletions += 1;
  }
  return { insertions, deletions };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function shortHash(value: string): string {
  return hash(value).slice(0, 12);
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT");
}
