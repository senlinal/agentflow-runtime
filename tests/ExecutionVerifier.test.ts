import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialContext } from "../core/context.ts";
import { ConstraintChecker } from "../core/verification/ConstraintChecker.ts";
import { ExecutionVerifier } from "../core/verification/ExecutionVerifier.ts";
import { FailureClassifier } from "../core/verification/FailureClassifier.ts";
import { VerificationEvidenceBuilder } from "../core/verification/VerificationEvidenceBuilder.ts";
import type { WorkflowContext } from "../core/types.ts";

describe("ExecutionVerifier", () => {
  it("passes when code, tests, diff, checkpoint, and constraints are clean", () => {
    const result = new ExecutionVerifier().verify(context());

    assert.equal(result.report.pass, true);
    assert.equal(result.report.nextAction, "end");
    assert.equal(result.evidence.checkpointId, "checkpoint_ok");
    assert.deepEqual(result.evidence.filesChanged, ["src/generated.txt"]);
    assert.deepEqual(result.evidence.filesAdded, ["src/generated.txt"]);
  });

  it("fails when code execution is missing", () => {
    const input = context();
    input.codeExecutionResult = null;

    const result = new ExecutionVerifier().verify(input);

    assert.equal(result.report.pass, false);
    assert.match(result.report.failedCriteria.join("\n"), /missing_code_execution_result/);
  });

  it("fails when tests fail", () => {
    const input = context();
    input.testExecutionResult = {
      status: "failed",
      completedSteps: ["Ran npm run test"],
      artifacts: [],
      summary: "failed",
      errors: ["npm run test exited with 1."],
      rawOutput: JSON.stringify({
        passed: false,
        commands: [{ command: "npm", args: ["run", "test"], exitCode: 1, timedOut: false }],
      }),
    };

    const result = new ExecutionVerifier().verify(input);

    assert.equal(result.report.pass, false);
    assert.match(result.report.failedCriteria.join("\n"), /test_failed/);
    assert.ok(result.report.failureCodes?.includes("test_failed"));
  });

  it("fails when operations are blocked", () => {
    const input = context();
    input.codeExecutionResult!.errors = ["Writing outside project root is blocked."];
    input.codeExecutionResult!.status = "failed";

    const result = new ExecutionVerifier().verify(input);

    assert.equal(result.report.pass, false);
    assert.match(result.report.failedCriteria.join("\n"), /operation_blocked/);
  });

  it("fails when unexpected files are changed", () => {
    const input = context();
    input.codingTaskContext = { allowedFiles: ["src/expected.txt"], maxFilesChanged: 3, maxPatchSize: 20000 };

    const result = new ExecutionVerifier().verify(input);

    assert.equal(result.report.pass, false);
    assert.match(result.report.failedCriteria.join("\n"), /unexpected_files_changed/);
  });

  it("fails when deleted files are detected", () => {
    const input = context({
      statusEntries: [{ status: "D", path: "src/old.txt" }],
      filesChangedByExecutor: ["src/old.txt"],
    });

    const result = new ExecutionVerifier().verify(input);

    assert.equal(result.report.pass, false);
    assert.match(result.report.failedCriteria.join("\n"), /file_deleted/);
  });

  it("fails when checkpoint evidence is missing", () => {
    const input = context({ checkpoint: null });

    const result = new ExecutionVerifier().verify(input);

    assert.equal(result.report.pass, false);
    assert.match(result.report.failedCriteria.join("\n"), /missing_checkpoint/);
  });

  it("fails when unsafe files are touched", () => {
    const input = context({
      statusEntries: [{ status: "??", path: ".env" }],
      filesChangedByExecutor: [".env"],
    });

    const result = new ExecutionVerifier().verify(input);

    assert.equal(result.report.pass, false);
    assert.match(result.report.failedCriteria.join("\n"), /unsafe_file_touched/);
  });

  it("fails when diff size exceeds maxFilesChanged", () => {
    const input = context({
      filesChangedByExecutor: ["src/a.txt", "src/b.txt"],
      statusEntries: [{ status: "??", path: "src/a.txt" }, { status: "??", path: "src/b.txt" }],
    });
    input.codingTaskContext = { allowedFiles: ["src/a.txt", "src/b.txt"], maxFilesChanged: 1, maxPatchSize: 20000 };

    const result = new ExecutionVerifier().verify(input);

    assert.equal(result.report.pass, false);
    assert.match(result.report.failedCriteria.join("\n"), /diff_too_large/);
  });
});

describe("VerificationEvidenceBuilder and classifiers", () => {
  it("builds structured evidence from execution raw outputs", () => {
    const evidence = VerificationEvidenceBuilder.build(context());

    assert.equal(evidence.codeStatus, "success");
    assert.equal(evidence.testStatus, "passed");
    assert.deepEqual(evidence.filesAdded, ["src/generated.txt"]);
    assert.equal(evidence.failedCommands.length, 0);
  });

  it("classifies constraint failures", () => {
    const evidence = VerificationEvidenceBuilder.build(context({ patchPreview: "x".repeat(20) }));
    const failures = ConstraintChecker.check({
      ...evidence,
      codingTaskContext: { allowedFiles: ["src/generated.txt"], maxPatchSize: 10 },
    });
    const classified = FailureClassifier.classify(evidence, failures);

    assert.match(classified.map((item) => item.code).join(","), /patch_too_large/);
  });

  it("classifies missing and safety failures", () => {
    const evidence = VerificationEvidenceBuilder.build(context());
    const classified = FailureClassifier.classify({
      ...evidence,
      codeStatus: "missing",
      testStatus: "missing",
      safetyFindings: [".env"],
      filesDeleted: ["src/old.txt"],
      blockedOperations: ["blocked write"],
    }, []);

    const codes = classified.map((item) => item.code);
    assert.ok(codes.includes("missing_code_execution_result"));
    assert.ok(codes.includes("missing_test_result"));
    assert.ok(codes.includes("operation_blocked"));
    assert.ok(codes.includes("unsafe_file_touched"));
    assert.ok(codes.includes("file_deleted"));
  });

  it("checks allowed files, unsafe files, max files, and deleted files", () => {
    const evidence = VerificationEvidenceBuilder.build(context({
      filesChangedByExecutor: ["src/generated.txt", ".env", "src/old.txt"],
      statusEntries: [
        { status: "M", path: "src/generated.txt" },
        { status: "??", path: ".env" },
        { status: "D", path: "src/old.txt" },
      ],
    }));

    const failures = ConstraintChecker.check({
      ...evidence,
      codingTaskContext: {
        allowedFiles: ["src/generated.txt"],
        allowFileDelete: false,
        maxFilesChanged: 1,
        maxPatchSize: 20000,
      },
    });

    assert.match(failures.join("\n"), /Unexpected files changed/);
    assert.match(failures.join("\n"), /Unsafe file touched/);
    assert.match(failures.join("\n"), /File deletion is not allowed/);
    assert.match(failures.join("\n"), /maxFilesChanged=1/);
  });
});

function context(options: {
  statusEntries?: Array<{ status: string; path: string }>;
  filesChangedByExecutor?: string[];
  patchPreview?: string;
  checkpoint?: { checkpointId: string } | null;
} = {}): WorkflowContext {
  const base = createInitialContext({
    taskId: "verify-test",
    userGoal: "verify controlled execution",
    successCriteria: ["Generated file exists.", "Fixture test command passes."],
  });
  return {
    ...base,
    taskBrief: {
      taskId: "verify-test",
      goal: "verify controlled execution",
      currentState: "fixture",
      constraints: [],
      resources: [],
      budget: "low",
      successCriteria: ["Generated file exists.", "Fixture test command passes."],
      nonGoals: [],
    },
    codingTaskContext: {
      allowedFiles: ["src/generated.txt"],
      maxFilesChanged: 3,
      maxPatchSize: 20000,
    },
    codeExecutionResult: {
      status: "success",
      completedSteps: ["Created checkpoint checkpoint_ok", "Wrote src/generated.txt"],
      artifacts: ["src/generated.txt"],
      summary: "code ok",
      errors: [],
      rawOutput: JSON.stringify({
        checkpoint: options.checkpoint === undefined ? { checkpointId: "checkpoint_ok" } : options.checkpoint,
        commandResults: [{ command: "node", args: ["-e", "console.log('ok')"], exitCode: 0, timedOut: false }],
        filesChangedByExecutor: options.filesChangedByExecutor ?? ["src/generated.txt"],
        diff: {
          filesChanged: options.filesChangedByExecutor ?? ["src/generated.txt"],
          statusEntries: options.statusEntries ?? [{ status: "??", path: "src/generated.txt" }],
          patchPreview: options.patchPreview ?? "small patch",
          stat: "src/generated.txt | 1 +",
        },
      }),
    },
    testExecutionResult: {
      status: "passed",
      completedSteps: ["Ran node -e test"],
      artifacts: [],
      summary: "tests ok",
      errors: [],
      rawOutput: JSON.stringify({
        passed: true,
        commands: [{ command: "node", args: ["-e", "test"], exitCode: 0, timedOut: false }],
      }),
    },
  };
}
