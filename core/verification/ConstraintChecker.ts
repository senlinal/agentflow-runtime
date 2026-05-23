import type { VerificationEvidence } from "./VerificationEvidenceBuilder.ts";

export class ConstraintChecker {
  static check(evidence: VerificationEvidence): string[] {
    const failures: string[] = [];
    const context = evidence.codingTaskContext;
    const allowedFiles = context?.allowedFiles ?? [];
    if (allowedFiles.length > 0) {
      const unexpected = evidence.filesChanged.filter((file) => !allowedFiles.includes(file));
      if (unexpected.length > 0) failures.push(`Unexpected files changed: ${unexpected.join(", ")}`);
    }
    const maxFilesChanged = context?.maxFilesChanged;
    if (typeof maxFilesChanged === "number" && evidence.filesChanged.length > maxFilesChanged) {
      failures.push(`Diff changed ${evidence.filesChanged.length} file(s), maxFilesChanged=${maxFilesChanged}.`);
    }
    const maxPatchSize = context?.maxPatchSize;
    if (typeof maxPatchSize === "number" && evidence.diffSummary.patchSize > maxPatchSize) {
      failures.push(`Patch size ${evidence.diffSummary.patchSize} exceeds maxPatchSize=${maxPatchSize}.`);
    }
    if (context?.allowFileDelete === false && evidence.filesDeleted.length > 0) {
      failures.push(`File deletion is not allowed: ${evidence.filesDeleted.join(", ")}`);
    }
    if (evidence.safetyFindings.length > 0) {
      failures.push(`Unsafe file touched: ${evidence.safetyFindings.join(", ")}`);
    }
    failures.push(...checkSuccessCriteria(evidence));
    return failures;
  }
}

function checkSuccessCriteria(evidence: VerificationEvidence): string[] {
  const criteria = [
    ...(evidence.taskBrief?.successCriteria ?? []),
    ...(evidence.codingTaskContext?.successCriteria ?? []),
  ];
  const failures: string[] = [];
  for (const criterion of criteria) {
    const normalized = criterion.toLowerCase();
    if ((normalized.includes("test") || criterion.includes("测试")) && evidence.testStatus !== "passed") {
      failures.push(`Success criteria failed: ${criterion}`);
    }
    if ((normalized.includes("trace") || criterion.includes("trace")) && evidence.executedOperations.length === 0) {
      failures.push(`Success criteria failed: ${criterion}`);
    }
    if ((normalized.includes("generated file") || criterion.includes("文件")) && evidence.filesChanged.length === 0) {
      failures.push(`Success criteria failed: ${criterion}`);
    }
  }
  return failures;
}
