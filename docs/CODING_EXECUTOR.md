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

The first version intentionally does not loop back into `codeExecutor` after verifier failure. This prevents repeated code modifications until a later stage adds a stricter patch planning and approval model.

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
