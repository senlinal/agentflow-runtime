# Agent Policy

## Permission Policy

Normal low-risk project work does not require user confirmation:

- Read files and inspect project structure.
- Create new project files.
- Edit source code, tests, examples, and documentation.
- Run local commands such as `npm run demo` and `npm run test`.
- Use `curl` for read-only inspection when it is relevant and does not execute remote scripts.

Actions that require notifying the user and waiting for confirmation:

- Delete files that already existed before the current work.
- Delete source files, config files, docs, lock files, or non-temporary directories.
- Run `rm -rf` on directories not created during the current work.
- Run `git reset --hard` or `git clean -fd`.
- Perform large rewrites that make review difficult.
- Introduce large dependencies.
- Call external APIs that may incur cost.
- Run remote installer scripts such as `curl ... | sh`.
- Modify files outside this project directory.

Temporary files created during the current work may be removed without confirmation. High-risk, irreversible, or data-loss-prone actions must pause for explicit approval.

### Runtime Policy Adapter

This project now includes an opencode policy adapter at `.opencode/plugins/agentflow-policy.ts`.

The plugin delegates static policy checks to `adapters/opencode/OpenCodePolicyService.ts`. It is intended to catch high-risk tool calls before execution, including deletion commands, project-external path operations, destructive git commands, recursive permission changes, `sudo`, and remote installer patterns such as `curl ... | sh`.

The implementation is conservative but not a complete shell parser. If a command is ambiguous and resembles a dangerous operation, the policy should return `ask` rather than silently allowing it.

Policy decisions are persisted under `.opencode/policy-runs/` as JSONL audit records. `ask` and `deny` records include the reason, matched rule, and affected paths. `ask` decisions also create pending approval files under `.opencode/policy-runs/pending/`.

Sensitive values such as tokens, passwords, API keys, credentials, and private keys must not be written verbatim to audit logs. The audit logger redacts sensitive fields and truncates large tool arguments.

The approval CLI records human decisions only:

- `npm run policy:pending`
- `npm run policy:approve -- --id <decisionId> --note "..."`
- `npm run policy:reject -- --id <decisionId> --note "..."`

Approving a policy record does not automatically resume or replay a blocked tool call in this phase.

Approval replay is constrained by tool call integrity:

- Approval does not execute anything automatically.
- Approval applies only to the exact original tool call hash.
- `toolName`, normalized args, command, affected paths, and project root must match.
- An approved request can be consumed once.
- Rejected, consumed, expired, or mismatched approvals cannot replay.
- Replay attempts are also written to the audit log.

Policy timeline is available for read-only audit review:

- `npm run policy:replay-history -- --id <decisionId>`
- `npm run policy:replay-history -- --id <decisionId> --format json`

Replay history must not execute commands, change approval state, consume approvals, or mutate policy logs. It exists to inspect ask, approve, reject, replay, consumed, denied, and allow events. Bad JSONL rows should be reported with file and line information instead of being silently ignored.

Do not delete `.opencode/policy-runs/` to hide or bypass policy history.

## Cost Policy

The system must not blindly proceed when the target appears too expensive, too broad, or under-specified.

Stop and produce a `FeasibilityReport` when the task has one or more of these properties:

- Cost is too high for the current phase.
- Scope is too large.
- Current information is insufficient.
- The task needs many external APIs.
- The task requires a long-running effort.
- The task requires complex UI or broad multi-module rewrites.
- The task is outside the reasonable scope of the current stage.

In these cases, `FeasibilityReport.decision` should usually be one of:

- `ask_human`
- `revise_goal`
- `stop`

It should not default to `proceed`.

## Quality Policy

Quality is more important than speed.

- Do not only implement the happy path.
- Do not hardcode workflow behavior just to make a demo pass.
- Do not delete tests to make tests pass.
- Do not swallow errors.
- Runtime must not hardcode concrete workflow sequences.
- Runtime must not hardcode concrete role output behavior.
- Workflow execution must remain configuration-driven.
- New condition types must have tests.
- New schemas must have tests.
- Every completed phase must run `npm run demo` and `npm run test`.
- Policy adapter changes must run `npm run opencode:check`, `npm run test`, and `npm run typecheck`.
- Real LLM calls must remain opt-in through explicit workflow node configuration. Mock workflows are the default test and demo path.
- API keys, tokens, provider credentials, and raw secrets must never be committed or written to trace, summary, audit, or policy logs.
