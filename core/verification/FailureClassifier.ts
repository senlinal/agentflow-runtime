import type { VerificationEvidence } from "./VerificationEvidenceBuilder.ts";

export type FailureCode =
  | "code_execution_failed"
  | "test_failed"
  | "operation_blocked"
  | "unsafe_file_touched"
  | "unexpected_files_changed"
  | "diff_too_large"
  | "patch_too_large"
  | "file_deleted"
  | "missing_checkpoint"
  | "missing_test_result"
  | "missing_code_execution_result"
  | "success_criteria_failed"
  | "unknown";

export type ClassifiedFailure = {
  code: FailureCode;
  message: string;
};

export class FailureClassifier {
  static classify(evidence: VerificationEvidence, constraintFailures: string[]): ClassifiedFailure[] {
    const failures: ClassifiedFailure[] = [];
    if (evidence.codeStatus === "missing") failures.push(failure("missing_code_execution_result", "CodeExecutionResult is missing."));
    if (evidence.codeStatus === "failed") failures.push(failure("code_execution_failed", "Code execution reported errors."));
    if (evidence.testStatus === "missing") failures.push(failure("missing_test_result", "TestExecutionResult is missing."));
    if (evidence.testStatus === "failed" || evidence.failedCommands.length > 0) {
      failures.push(failure("test_failed", "One or more configured test commands failed."));
    }
    if (evidence.blockedOperations.length > 0) failures.push(failure("operation_blocked", "One or more operations were blocked."));
    if (evidence.safetyFindings.length > 0) failures.push(failure("unsafe_file_touched", "Unsafe or sensitive file path was touched."));
    if (evidence.filesDeleted.length > 0) failures.push(failure("file_deleted", "Deleted files were detected."));
    if (!evidence.checkpointId) failures.push(failure("missing_checkpoint", "Checkpoint evidence is missing."));
    for (const item of constraintFailures) {
      if (/patch/i.test(item)) failures.push(failure("patch_too_large", item));
      else if (/diff/i.test(item)) failures.push(failure("diff_too_large", item));
      else if (/delet/i.test(item)) failures.push(failure("file_deleted", item));
      else if (/unsafe|secret|token|credential|key|\.env/i.test(item)) failures.push(failure("unsafe_file_touched", item));
      else if (/success criteria/i.test(item)) failures.push(failure("success_criteria_failed", item));
      else failures.push(failure("unexpected_files_changed", item));
    }
    return dedupe(failures);
  }
}

function failure(code: FailureCode, message: string): ClassifiedFailure {
  return { code, message };
}

function dedupe(failures: ClassifiedFailure[]): ClassifiedFailure[] {
  const seen = new Set<string>();
  return failures.filter((failure) => {
    const key = `${failure.code}:${failure.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
