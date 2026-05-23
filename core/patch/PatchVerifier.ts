import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import type { PatchExportRecord, PatchVerificationResult } from "../types.ts";

export type PatchVerifierOptions = {
  forbiddenFiles?: string[];
};

export class PatchVerifier {
  async verify(record: PatchExportRecord, options: PatchVerifierOptions = {}): Promise<PatchVerificationResult> {
    const blockedReasons: string[] = [];
    const warnings: string[] = [];

    const patchText = await readRequiredText(record.patchPath, "patch file", blockedReasons);
    const metadataText = await readRequiredText(record.metadataPath, "metadata file", blockedReasons);
    await readRequiredText(record.applyGuidePath, "apply guide", blockedReasons);

    if (metadataText) {
      try {
        const metadata = JSON.parse(metadataText) as Partial<PatchExportRecord>;
        if (metadata.patchExportId !== record.patchExportId) blockedReasons.push("metadata patchExportId does not match requested record.");
        if (metadata.patchHash !== record.patchHash) blockedReasons.push("metadata patchHash does not match requested record.");
      } catch (error) {
        blockedReasons.push(`metadata file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const patchHashMatched = patchText ? `sha256:${sha256(patchText)}` === record.patchHash : false;
    if (!patchHashMatched) blockedReasons.push("patchHash does not match current patch file content.");

    if (!patchText || patchText.trim().length === 0) blockedReasons.push("patch file is empty.");
    if (patchText && containsBinaryPatch(patchText)) blockedReasons.push("patch appears to contain binary content.");
    if (patchText && containsDangerousCommandContent(patchText)) blockedReasons.push("patch contains obviously dangerous command content.");

    const parsedFiles = patchText ? parsePatchFiles(patchText) : [];
    const checkedFiles = unique([...record.changedFiles, ...parsedFiles]);
    const metadataChanged = new Set(record.changedFiles);
    for (const file of parsedFiles) {
      if (!metadataChanged.has(file)) blockedReasons.push(`patch touches file not listed in metadata.changedFiles: ${file}`);
    }
    for (const file of record.changedFiles) {
      if (patchText && !parsedFiles.includes(file)) warnings.push(`metadata.changedFiles includes file not found in patch diff headers: ${file}`);
    }

    if (record.filesDeleted.length > 0) blockedReasons.push(`patch deletes file(s): ${record.filesDeleted.join(", ")}`);
    const forbidden = new Set(options.forbiddenFiles ?? []);
    for (const file of checkedFiles) {
      if (forbidden.has(file)) blockedReasons.push(`patch touches forbidden file: ${file}`);
      if (isSensitivePath(file)) blockedReasons.push(`patch touches sensitive path: ${file}`);
    }

    const suggestedManualCommands = [
      `npm run patch:show -- --id ${record.patchExportId}`,
      `npm run patch:apply-guide -- --id ${record.patchExportId}`,
      `# Optional manual check from source project root: git apply --check ${record.patchPath}`,
    ];

    return {
      patchExportId: record.patchExportId,
      status: blockedReasons.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
      patchHashMatched,
      checkedFiles,
      blockedReasons,
      warnings,
      suggestedManualCommands,
      manualReviewRequired: true,
    };
  }
}

export function formatPatchVerificationResult(result: PatchVerificationResult, format: "text" | "json" = "text"): string {
  if (format === "json") return `${JSON.stringify(result, null, 2)}\n`;
  return [
    `Patch Verification ${result.patchExportId}`,
    "",
    `status: ${result.status}`,
    `patchHashMatched: ${result.patchHashMatched}`,
    `checkedFiles: ${result.checkedFiles.join("; ") || "none"}`,
    `blockedReasons: ${result.blockedReasons.join("; ") || "none"}`,
    `warnings: ${result.warnings.join("; ") || "none"}`,
    `manualReviewRequired: ${result.manualReviewRequired}`,
    "",
    "Suggested manual commands:",
    ...result.suggestedManualCommands.map((command) => `- ${command}`),
    "",
    "This verification is read-only. It does not run git apply, does not modify the source project, and does not run tests.",
    "",
  ].join("\n");
}

async function readRequiredText(path: string, label: string, blockedReasons: string[]): Promise<string | null> {
  try {
    const fileStat = await stat(path);
    if (!fileStat.isFile()) {
      blockedReasons.push(`${label} is not a file: ${path}`);
      return null;
    }
    return await readFile(path, "utf8");
  } catch (error) {
    blockedReasons.push(`${label} does not exist or cannot be read: ${path} (${error instanceof Error ? error.message : String(error)})`);
    return null;
  }
}

function parsePatchFiles(patchText: string): string[] {
  const files: string[] = [];
  for (const line of patchText.split(/\r?\n/)) {
    const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (match?.[1]) files.push(match[1]);
  }
  return unique(files);
}

function containsBinaryPatch(patchText: string): boolean {
  return /(^|\n)(GIT binary patch|Binary files .+ differ)(\n|$)/.test(patchText);
}

function containsDangerousCommandContent(patchText: string): boolean {
  const addedLines = patchText.split(/\r?\n/).filter((line) => line.startsWith("+") && !line.startsWith("+++"));
  return addedLines.some((line) => /\b(rm\s+-rf|git\s+reset\s+--hard|git\s+clean\s+-[fxd]+|curl\b.+\|\s*(sh|bash)|wget\b.+\|\s*(sh|bash)|sudo\b|chmod\s+-R|chown\s+-R)\b/.test(line));
}

function isSensitivePath(path: string): boolean {
  const normalized = path.toLowerCase();
  return (
    normalized === ".env" ||
    normalized.endsWith("/.env") ||
    normalized.endsWith(".pem") ||
    normalized.endsWith(".key") ||
    normalized.includes("token") ||
    normalized.includes("credential") ||
    normalized.includes("secret")
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
