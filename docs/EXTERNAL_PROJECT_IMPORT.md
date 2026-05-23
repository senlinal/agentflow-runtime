# External Project Import

The external project runner copies a user-provided project into a temporary workspace before running any controlled execution.

It is designed for first-pass trials where the original project must remain untouched.

## What It Does

`ExternalProjectImporter`:

- validates that the source path exists and is a directory;
- rejects the current repository root by default;
- rejects system-sensitive directories;
- copies the project into a temporary workspace;
- excludes common local/runtime artifacts such as `node_modules`, `.git`, `dist`, `coverage`, `.env`, `.workflow-runs`, `.opencode/policy-runs`, and `.agentflow/executions`;
- returns an `ImportedProjectWorkspace` with import id, source path, workspace path, copied file count, excluded paths, and timestamp.

`ExternalProjectWorkspaceRunner` then runs the existing `code-change-plan-execution` workflow against the copied workspace only.

## Demo

```bash
npm run demo:external-project-import
```

The demo uses the E2E fixture as the external source project, copies it to a temp workspace, confirms the initial tests fail, applies a scoped `CodeChangePlan` to `src/calculator.ts`, runs tests, verifies the result, writes a patch export, and saves execution records.

## CLI

```bash
npm run external:run -- \
  --source /path/to/project \
  --target src/calculator.ts \
  --contentFile /path/to/fixed-calculator.ts \
  --testCommand "npm run test"
```

Optional:

```bash
--input inputs/e2e-real-project-fix-task.json
--allowedFiles src/calculator.ts
--forbiddenFiles src/string-utils.ts,.env,.env.local
```

The CLI does not write changes back to the source project. It prints the copied workspace, patch export id, patch hash, patch path, metadata path, apply guide path, execution id, execution record path, rollback guide path, summary path, and trace path.

## Patch Export / Apply Guidance

Every successful external project run writes a patch export under `.agentflow/patch-exports/`.

```bash
npm run patch:list
npm run patch:show -- --id <patchExportId>
npm run patch:apply-guide -- --id <patchExportId>
npm run patch:verify -- --id <patchExportId>
```

The patch export contains:

- `changes.patch`;
- `metadata.json` with `patchHash`, changed files, insertions, deletions, test status, and verification status;
- `APPLY_GUIDE.md` with manual review steps.

`patch:verify` checks that the patch file and metadata exist, the `sha256` hash matches, the patch only touches `metadata.changedFiles`, no files are deleted, no sensitive paths are touched, the patch is not binary, and no obvious dangerous command content was added.

The apply guide and verify command are intentionally read-only. AgentFlow does not run `git apply`, does not write changes back to the source project, does not run tests, and does not perform rollback commands. The user must manually review and apply the patch with their own git workflow.

## Safety Properties

- The source project is not modified.
- Execution happens only inside the copied temporary workspace.
- `delete_file` remains unsupported.
- High-risk shell remains blocked by the existing controlled execution layer.
- No real LLM is called.
- Raw patch output is written under `.agentflow/external-runs/`, which is ignored by Git.
- Formal patch exports are written under `.agentflow/patch-exports/`, which is ignored by Git.
- Rollback guidance remains read-only and non-destructive.

## Current Limits

- The first version requires explicit target file content.
- It does not synthesize code changes from natural language.
- It does not write patches back to the source project.
- It does not automatically apply exported patches.
- It does not run dependency installation.
- It does not support destructive rollback.
