import type { VerificationReport, WorkflowContext } from "../types.ts";
import { ConstraintChecker } from "./ConstraintChecker.ts";
import { FailureClassifier } from "./FailureClassifier.ts";
import { VerificationEvidenceBuilder, type VerificationEvidence } from "./VerificationEvidenceBuilder.ts";

export type ExecutionVerificationResult = {
  report: VerificationReport;
  evidence: VerificationEvidence;
};

export class ExecutionVerifier {
  verify(context: WorkflowContext): ExecutionVerificationResult {
    const evidence = VerificationEvidenceBuilder.build(context);
    const constraintFailures = ConstraintChecker.check(evidence);
    const failures = FailureClassifier.classify(evidence, constraintFailures);
    const pass = failures.length === 0;
    const failedCriteria = failures.map((failure) => `${failure.code}: ${failure.message}`);

    return {
      evidence,
      report: {
        pass,
        score: pass ? 0.97 : Math.max(0.1, 0.85 - failures.length * 0.1),
        failedCriteria,
        reason: pass
          ? "Execution evidence satisfies code execution, test, diff, checkpoint, safety, and success-criteria checks."
          : `Execution verification failed: ${failedCriteria.join("; ")}`,
        nextAction: pass ? "end" : "retry_execute",
        feedbackToPlanner: pass
          ? "No further execution required."
          : "Review verification evidence and correct only the failed execution or test criteria before retrying.",
        failureCodes: failures.map((failure) => failure.code),
        evidence: summarizeEvidence(evidence),
        safetyFindings: evidence.safetyFindings,
        recommendedFixes: pass ? [] : failures.map((failure) => recommendedFix(failure.code)),
      },
    };
  }
}

function summarizeEvidence(evidence: VerificationEvidence): Record<string, unknown> {
  return {
    codeStatus: evidence.codeStatus,
    testStatus: evidence.testStatus,
    checkpointId: evidence.checkpointId,
    filesChanged: evidence.filesChanged,
    filesAdded: evidence.filesAdded,
    filesModified: evidence.filesModified,
    filesDeleted: evidence.filesDeleted,
    failedCommands: evidence.failedCommands,
    blockedOperations: evidence.blockedOperations,
    diffSummary: evidence.diffSummary,
    safetyFindings: evidence.safetyFindings,
  };
}

function recommendedFix(code: string): string {
  switch (code) {
    case "code_execution_failed":
      return "Fix the controlled code operation errors before rerunning tests.";
    case "test_failed":
      return "Fix the failing configured test command and rerun the test node.";
    case "operation_blocked":
      return "Remove or narrow the blocked operation instead of expanding executor permissions.";
    case "unsafe_file_touched":
      return "Avoid touching secret, token, credential, key, or environment files.";
    case "unexpected_files_changed":
      return "Restrict changes to the allowed file list for this coding task.";
    case "diff_too_large":
    case "patch_too_large":
      return "Reduce the patch size or split the change into a smaller task.";
    case "file_deleted":
      return "Restore deleted files; this workflow does not treat deletion as successful.";
    case "missing_checkpoint":
      return "Ensure the code executor creates a checkpoint before applying changes.";
    case "missing_test_result":
      return "Run the configured TestRunner node and provide its structured result.";
    case "missing_code_execution_result":
      return "Run the CodeExecutor node and provide its structured result.";
    case "success_criteria_failed":
      return "Align the implementation and tests with the rule-checkable success criteria.";
    default:
      return "Review the verification evidence and rerun only the safe, declared steps.";
  }
}
