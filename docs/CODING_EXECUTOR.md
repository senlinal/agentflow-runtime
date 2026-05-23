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
codeExecutor -> testRunner -> verifier
  pass=true  -> end
  pass=false -> repairPlanBuilder -> humanApprovalGate -> end
```

The verifier uses the deterministic `ExecutionVerifier` through a `type: "verify"` node. It evaluates code execution output, test output, checkpoint evidence, diff metadata, safety findings, changed files, and success criteria without calling an LLM.

The failure branch intentionally does not loop back into `codeExecutor` after verifier failure. Instead, it creates a scoped repair plan and a pending human approval request. This prevents repeated code modifications until a later stage adds a stricter patch planning and approval replay model.

The verifier emits a `VerificationReport` with optional execution-aware fields:

- `failureCodes`: machine-readable reasons such as `test_failed`, `operation_blocked`, `unsafe_file_touched`, `unexpected_files_changed`, `file_deleted`, `missing_checkpoint`, `missing_test_result`, and `missing_code_execution_result`.
- `evidence`: summarized code status, test status, checkpoint id, changed files, deleted files, failed commands, blocked operations, and diff metadata.
- `safetyFindings`: sensitive or unsafe paths touched by the execution result.
- `recommendedFixes`: narrow remediation guidance for the failed checks.

It fails verification when code execution fails, configured tests fail, operations are blocked, files are deleted, unexpected files change, diff or patch limits are exceeded, checkpoint evidence is missing, test evidence is missing, unsafe files are touched, or rule-checkable success criteria are not met. It does not perform semantic code review and it does not automatically retry or rollback.

## Scoped Repair Plan And Approval Gate

When `verification.pass=false`, the workflow enters `repairPlanBuilder` and then `humanApprovalGate`.

`repairPlanBuilder` produces `ScopedRepairPlan`:

- `basedOnFailureCodes` and `basedOnFailedCriteria` copy the verifier evidence.
- `targetFiles` is derived from changed files and allowed files, excluding secret-like paths.
- `forbiddenFiles` includes deleted files, unsafe files, and secret-like path patterns.
- `proposedOperations` describes bounded inspect / modify / run-test / manual-review actions.
- `testCommands` comes from configured TestRunner evidence.
- `requiresHumanApproval` is always `true`.

`humanApprovalGate` produces `HumanApprovalRequest` with `status: "pending"` and `blockedUntilApproved: true`.

This stage does not execute repairs, does not approve itself, does not expand executor permissions, and does not add a retry loop.

## Approved Repair Materialization

`workflows/approved-repair-materialize.json` adds the next controlled step:

```text
repairPlanMaterializer -> end
```

It requires an existing `ScopedRepairPlan` plus a `RepairApprovalRecord` with `status: "approved"`. Pending, rejected, consumed, expired, or mismatched approvals are rejected.

`repairPlanMaterializer` produces `CodeChangePlan`:

- `status` is always `materialized`.
- `executable` is always `false`.
- `requiresExplicitExecutionApproval` is always `true`.
- Operations are copied only from the approved scoped repair plan.
- Operation paths must stay inside `targetFiles` and must not appear in `forbiddenFiles`.
- Secret-like paths such as `.env`, key, token, credential, or secret files are rejected.
- `delete_file` is not supported.
- High-risk shell commands are rejected.

Materialization does not write files, does not run tests, does not call `CodeExecutor`, and does not retry the failed workflow. It only creates a safe reviewable `CodeChangePlan` for a later explicit execution stage.

## CodeChangePlan Execution Approval Request

`workflows/code-change-plan-execution-approval.json` adds a request-only approval gate:

```text
codeChangePlanExecutionApprovalGate -> end
```

The gate requires a materialized `CodeChangePlan` where:

- `executable=false`;
- `requiresExplicitExecutionApproval=true`;
- `blockedOperations` is empty;
- no operation uses `delete_file`.

It produces `CodeChangePlanExecutionApprovalRequest` with `status: "pending"`, `requestedAction: "approve_code_change_plan_execution"`, and a stable `codeChangePlanHash`.

This request is not execution authorization. The stage does not write files, run commands, run tests, call `CodeExecutor`, auto-approve, or consume an approval. It only records that a later execution phase must receive a separate explicit approval bound to the same CodeChangePlan hash.

## Approved Execution Dry-run

`workflows/code-change-plan-execution-dry-run.json` adds the next non-executing step:

```text
codeChangePlanDryRunRunner -> end
```

The runner requires:

- a materialized `CodeChangePlan`;
- `CodeChangePlanExecutionApprovalRecord.status="approved"`;
- matching `codeChangePlanHash`;
- no expired, rejected, consumed, pending, or mismatched approval;
- no `delete_file`, forbidden paths, sensitive paths, unscoped target files, non-allowlisted commands, or high-risk commands.

It produces `CodeChangePlanDryRunExecutionPlan` with `mode: "dry_run"` and `status: "planned"`.

Dry-run is still not execution. It does not write files, run commands, run tests, call `CodeExecutor`, consume approval, or change approval status. A later stage must add an explicit execution runner if real application is desired.

## Approved CodeChangePlan Execution

`workflows/code-change-plan-execution.json` adds the explicit execution step:

```text
codeChangePlanExecutionRunner -> end
```

The runner requires an approved `CodeChangePlanExecutionApprovalRecord`, recomputes and checks the `codeChangePlanHash`, rejects pending / rejected / expired / consumed approvals, rejects `delete_file`, forbidden or sensitive paths, scope expansion, missing operation content, non-allowlisted commands, and high-risk shell.

When allowed, it:

- creates a checkpoint through `CodeExecutor`;
- applies only declared `create_file` / `modify_file` operations that include explicit `content`;
- runs the plan's `testCommands` through `TestRunner`;
- runs the execution-aware verifier;
- writes `CodeChangePlanExecutionRecord`;
- marks the approval as `consumed` with `consumedAt` and `consumedByExecutionId`;
- creates a manual rollback guide.

This stage does not auto-approve, does not retry, does not support `delete_file`, and does not perform destructive rollback. If tests or verification fail after files were written, the execution record is `failed`, approval is consumed, and the rollback guide explains manual review steps.

Execution records are persisted under `.agentflow/executions/`:

```bash
npm run execution:list
npm run execution:show -- --id <executionId>
npm run execution:rollback-guide -- --id <executionId>
```

The rollback guide CLI is read-only. It displays checkpoint, changed files, suggested commands, and manual review steps, but it does not run rollback commands.

## Real Project E2E Trial

`tests/fixtures/e2e-real-project/` provides a small project with two source files and two tests. `calculator.add` intentionally starts broken, while `string-utils` remains correct.

Run:

```bash
npm run demo:e2e-real-project
```

The demo copies the fixture to a temporary workspace, initializes Git, confirms the initial `npm run test` fails, runs `code-change-plan-execution` with a hash-bound approved plan that only modifies `src/calculator.ts`, reruns tests, verifies the result, and persists an execution record plus rollback guide.

The fixture original is treated as read-only. The demo does not call a real LLM, does not support `delete_file`, does not run high-risk shell, and does not perform destructive rollback.

## External Project Import

`ExternalProjectImporter` and `ExternalProjectWorkspaceRunner` extend the E2E trial to user-provided project paths while preserving the same safety boundary.

Run:

```bash
npm run demo:external-project-import
```

Or provide a project path explicitly:

```bash
npm run external:run -- --source /path/to/project --target src/file.ts --contentFile /path/to/fixed-file.ts --testCommand "npm run test"
```

The importer validates the source directory, rejects the current repository root by default, excludes `node_modules`, `.git`, `dist`, `coverage`, `.env`, workflow runs, policy logs, and execution records, then copies the project into a temporary workspace. The controlled execution workflow runs only inside that copied workspace.

The runner outputs a patch path, execution record, rollback guide, workflow summary, and trace. It does not write changes back to the original project.

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
- No automatic repair execution after verifier failure.
- No automatic execution of materialized `CodeChangePlan`.
- The allowlist is intentionally narrow and should be expanded through tests.
- The execution-aware verifier is rule-based. It does not infer semantic correctness beyond available execution evidence and rule-checkable success criteria.
