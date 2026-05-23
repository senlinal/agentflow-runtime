# Quickstart

This guide gets a fresh clone running with mock workflows only. No API key is required.

## 1. Clone

```bash
git clone <your-repo-url>
cd <repo>
```

## 2. Check The Environment

```bash
npm run doctor
```

The doctor command checks the Node version, required files, required npm scripts, sample templates, and whether local runtime files such as `.env` or `.workflow-runs/` are tracked by Git.

## 3. Run A Demo

```bash
npm run demo
```

This uses `MockLLMClient` and exercises the Planner -> Debater -> PlannerRevision -> Executor -> Verifier -> GoalKeeper loop.

## 4. Run A Reusable Workflow Template

```bash
npm run workflow -- --template research-feasibility-execute-verify --input inputs/feasible-task.json
```

The workflow first creates a `ResearchReport`, then a `FeasibilityReport`. If the task is feasible, it enters the Planner / Executor / Verifier flow. If it is too broad or too risky, it stops before execution.

Try the infeasible sample:

```bash
npm run workflow -- --template research-feasibility-execute-verify --input inputs/infeasible-task.json
```

## 5. Inspect Templates And Roles

```bash
npm run workflow:list
npm run workflow:roles
npm run workflow:inspect -- --template abcde-basic
npm run workflow:validate -- --template abcde-basic
```

## 6. Run Controlled Code-Test-Verify

```bash
npm run workflow -- --template code-test-verify --input inputs/feasible-task.json
```

This template runs the controlled `CodeExecutor`, then the configured `TestRunner`, then a deterministic `type: "verify"` node that checks test status, diff evidence, blocked operations, and checkpoint metadata.

If verification fails, the template stops through `repairPlanBuilder -> humanApprovalGate` with a scoped repair plan and a pending human approval request. It does not automatically retry code execution.

Run the failing review-path demo:

```bash
npm run demo:code-test-repair-review
```

Run the approved materialization demo:

```bash
npm run demo:approved-repair-materialize
```

This converts an already approved `ScopedRepairPlan` into a non-executable `CodeChangePlan`. It does not write files, run tests, or call `CodeExecutor`.

Create a pending execution approval request for a materialized `CodeChangePlan`:

```bash
npm run demo:code-change-plan-execution-approval
```

This records a hash-bound request with `status=pending`. It does not apply the plan, run tests, or call `CodeExecutor`.

Generate an approved execution dry-run plan:

```bash
npm run demo:code-change-plan-execution-dry-run
```

This requires an approved execution approval record, verifies the `CodeChangePlan` hash, and creates a dry-run plan only. It still does not write files, run commands, run tests, call `CodeExecutor`, or consume approval.

Run the explicit controlled execution demo:

```bash
npm run demo:code-change-plan-execution
```

This uses a temporary workspace, requires an approved execution approval record, rechecks the `CodeChangePlan` hash, creates a checkpoint, applies only declared file operations, runs scoped tests, verifies the result, creates a rollback guide, and consumes the approval once. It does not support delete operations, high-risk shell, automatic approval, or destructive rollback.

Inspect persisted execution records and rollback guidance:

```bash
npm run execution:list
npm run execution:show -- --id <executionId>
npm run execution:rollback-guide -- --id <executionId>
```

Run the real-project E2E trial:

```bash
npm run demo:e2e-real-project
```

This copies a small fixture project to a temporary workspace, confirms the initial tests fail, applies an approved scoped `CodeChangePlan` to `src/calculator.ts`, reruns tests, verifies the result, and prints execution record query commands. The fixture original is not modified.

## 7. LLM Config Dry-Run

```bash
npm run llm:config
npm run llm:smoke
```

`llm:smoke` is dry-run by default and does not call external providers. Do not run `--execute` unless you intentionally want a real provider call.

## 8. Full Local Verification

```bash
npm run verify
```

This runs release checks, doctor, opencode adapter checks, workflow validation, LLM dry-run checks, tests, and typecheck.
