# Coding Executor and TestRunner

Phase 16 adds the first controlled engineering execution layer.

## Scope

The runtime now supports two additional workflow node types:

- `code`: runs a constrained `CodeExecutor`.
- `test`: runs a reusable `TestRunner` through `TestExecutor`.

`WorkflowRuntime` still only schedules nodes, validates outputs, writes context, and resolves edges. It does not know how code execution works.

## Safety Model

The first version is intentionally conservative:

- Commands are executed with `child_process.spawn` and `shell: false`.
- Shell metacharacters such as pipes, redirects, `&&`, `;`, and command substitution are rejected.
- Destructive executables such as `rm`, `unlink`, `rmdir`, `sudo`, `curl`, and `wget` are rejected by default.
- Command working directories must stay inside the configured project root.
- File writes must stay inside the configured project root.
- Sensitive file targets such as `.env`, `.pem`, and `.key` are rejected.
- Existing files are not overwritten unless `overwrite: true` is explicitly set on a declared file write.
- The executor creates a checkpoint and collects a git diff summary.
- Automatic destructive rollback is not performed. The checkpoint and diff are recorded for review.

## Code Node Example

```json
{
  "id": "code_executor",
  "type": "code",
  "role": "Executor",
  "description": "Run controlled file updates and safe commands.",
  "inputKeys": ["revisedPlan"],
  "outputKey": "executionResult",
  "outputSchema": "ExecutionResult",
  "executorConfig": {
    "fileWrites": [
      {
        "path": "generated/example.txt",
        "content": "hello\n"
      }
    ],
    "commands": ["npm run typecheck"],
    "timeoutMs": 120000
  }
}
```

## Test Node Example

```json
{
  "id": "test_runner",
  "type": "test",
  "role": "Executor",
  "description": "Run configured verification commands.",
  "inputKeys": ["executionResult"],
  "outputKey": "executionResult",
  "outputSchema": "ExecutionResult",
  "executorConfig": {
    "commands": ["npm run test", "npm run typecheck"],
    "timeoutMs": 120000
  }
}
```

## Formal Workflow Template

`workflows/code-test-verify.json` provides a reusable three-step template:

```text
codeExecutor -> testRunner -> verifier -> end
```

The verifier uses the deterministic `ExecutionVerifier` through a `type: "verify"` node. It evaluates code execution output, test output, checkpoint evidence, diff metadata, safety findings, changed files, and success criteria without calling an LLM.

The first version intentionally does not loop back into `codeExecutor` after verifier failure. This prevents repeated code modifications until a later stage adds a stricter patch planning and approval model.

The verifier emits a `VerificationReport` with optional execution-aware fields:

- `failureCodes`: machine-readable reasons such as `test_failed`, `operation_blocked`, `unsafe_file_touched`, `unexpected_files_changed`, `file_deleted`, `missing_checkpoint`, `missing_test_result`, and `missing_code_execution_result`.
- `evidence`: summarized code status, test status, checkpoint id, changed files, deleted files, failed commands, blocked operations, and diff metadata.
- `safetyFindings`: sensitive or unsafe paths touched by the execution result.
- `recommendedFixes`: narrow remediation guidance for the failed checks.

It fails verification when code execution fails, configured tests fail, operations are blocked, files are deleted, unexpected files change, diff or patch limits are exceeded, checkpoint evidence is missing, test evidence is missing, unsafe files are touched, or rule-checkable success criteria are not met. It does not perform semantic code review and it does not automatically retry or rollback.

## Output

Both `code` and `test` nodes return `ExecutionResult`:

- `completedSteps`
- `artifacts`
- `summary`
- `errors`
- `rawOutput`

`rawOutput` contains structured JSON with command results, checkpoint data, and diff summaries.

## Current Limits

- No arbitrary shell execution.
- No LLM-driven command execution.
- No automatic destructive rollback.
- No delete operations.
- The allowlist is intentionally narrow and should be expanded through tests.
- The execution-aware verifier is rule-based. It does not infer semantic correctness beyond available execution evidence and rule-checkable success criteria.
