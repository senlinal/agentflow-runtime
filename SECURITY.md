# Security Policy

## Supported Versions

This repository is currently pre-1.0. Security fixes target the current `main` branch.

## Reporting A Vulnerability

Please do not open a public issue for secrets, command execution bypasses, or provider credential leaks.

Report privately through the repository owner's preferred private channel. Include:

- affected file or command;
- reproduction steps;
- expected vs actual behavior;
- whether secrets, filesystem writes, or external calls are involved.

## Security Model

- Default workflows use `MockLLMClient`.
- Real LLM calls are opt-in and require explicit provider configuration.
- Tests must not call external providers.
- API keys must stay in environment variables and must not be committed.
- Workflow runs are written under `.workflow-runs/` and ignored by Git.
- Policy audit logs are written under `.opencode/policy-runs/` and ignored by Git.
- The opencode policy plugin is a guardrail, not a full sandbox.
- The controlled code-test verifier fails unsafe execution instead of treating it as success. Unsafe file touches, unexpected files, deleted files, blocked operations, missing checkpoints, and failed tests produce `VerificationReport.pass=false`.
- A failed code-test verification can create a scoped repair plan and pending approval request, but it does not execute repair operations or retry code execution automatically.
- Scoped repair plans do not support `delete_file` operations. High-risk repair evidence remains pending for human review and cannot auto-approve.
- Approval is not execution. An approved repair can only be materialized into a reviewable plan unless a later stage adds a separate explicit execution approval.
- Approved scoped repair plans can be materialized into `CodeChangePlan`, but materialization is not execution. It does not write files, run commands, run tests, or call `CodeExecutor`.
- `CodeChangePlan` keeps `requiresExplicitExecutionApproval=true` and rejects pending, rejected, expired, consumed, mismatched, scope-expanding, secret-touching, delete, and high-risk command operations.
- A materialized `CodeChangePlan` can create a pending execution approval request. The request is bound to a `codeChangePlanHash`, but pending approval is not execution authorization.
- CodeChangePlan execution approval request generation does not write files, run commands, run tests, or call `CodeExecutor`.
- The `codeChangePlanHash` prevents approving one plan and executing another. Changing operations, target files, executable flags, or explicit approval requirements changes the hash.
- Approved execution approval can produce a dry-run execution plan, but dry-run is still non-executing. It does not write files, run commands, run tests, call `CodeExecutor`, or consume approval.
- Dry-run rejects pending, rejected, expired, consumed, mismatched, scope-expanding, secret-touching, delete, non-allowlisted, and high-risk command plans.

## High-Risk Areas

- shell command classification;
- file deletion approval;
- approval replay integrity;
- LLM provider error redaction;
- template validation;
- schema validation before context writes.
- execution-aware verification of code/test/diff evidence.

## Maintainer Checklist

Before release:

```bash
npm run release:check
npm run verify
```

Never run `npm run llm:smoke -- --execute` as part of automated release checks.
