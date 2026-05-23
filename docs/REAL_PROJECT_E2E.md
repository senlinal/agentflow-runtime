# Real Project E2E Trial

`demo:e2e-real-project` exercises the approved execution chain against a small copied fixture project instead of a synthetic one-file workspace.

The fixture lives under `tests/fixtures/e2e-real-project/` and contains:

- `src/calculator.ts`
- `src/string-utils.ts`
- `tests/calculator.test.js`
- `tests/string-utils.test.js`
- `package.json`

The fixture intentionally starts with a bug: `calculator.add(a, b)` returns `a - b`. The calculator test expects `add(1, 2) === 3`, while the string utility tests already pass.

## How It Runs

```bash
npm run demo:e2e-real-project
```

The demo:

1. Copies the fixture into a temporary workspace.
2. Initializes Git inside that temporary workspace.
3. Runs `npm run test` and confirms the initial test status is failed.
4. Builds a scoped `CodeChangePlan` that only modifies `src/calculator.ts`.
5. Builds an approved execution approval record bound to the plan hash.
6. Runs the `code-change-plan-execution` workflow.
7. Applies the declared change through `CodeExecutor`.
8. Runs `npm run test` through `TestRunner`.
9. Verifies the result through the execution-aware verifier.
10. Saves an execution record and non-destructive rollback guide.

The original fixture files are not modified. The working changes happen only in the copied temporary workspace.

## Inspecting Results

The demo prints an `executionId` and suggested commands:

```bash
npm run execution:list
npm run execution:show -- --id <executionId>
npm run execution:rollback-guide -- --id <executionId>
```

The rollback guide command is read-only. It does not run `git reset`, `git checkout`, or any rollback command.

## Current Limits

- No real LLM is called.
- No `delete_file` operation is supported.
- No high-risk shell is allowed.
- No automatic retry loop is added.
- No destructive rollback is performed.
- The demo uses a temporary workspace and should not be used as a deployment mechanism.
