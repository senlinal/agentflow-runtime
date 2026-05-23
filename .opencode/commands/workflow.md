# /workflow

Use this command to run the repository's workflow template runner from opencode using the active workflow profile.

## Usage

`/workflow <goal, current state, optional constraints>`

## Instructions

1. Read `AGENTS.md`.
2. Read `profiles/current.json`, then load the active profile from `profiles/<activeProfile>.json`.
3. Read the active profile's `policyFiles`.
4. Read or summarize existing `memoryFiles`; if a memory file is missing, record a warning and continue.
5. Read recent Project Memory when available using `npm run memory:summary -- --profile <activeProfile>` or the profile tool result. Use it to avoid repeating confirmed scope questions, failed routes, and rejected approaches.
6. Convert the user's message into a structured TaskBrief:
   - `goal`
   - `currentState`
   - `constraints`
   - `resources`
   - `budget`
   - `successCriteria`
   - `nonGoals`
   - `rawUserInput`
7. Default to the active profile's `defaultWorkflow`. Do not ask the user to repeat default constraints already present in `AGENTS.md`, policy files, memory files, project memory, or the active profile.
8. Prefer the custom tool `run_profile_workflow` with `task` and optional `profile`. If the user is answering prior scope questions, call `run_profile_workflow` with `answer` and optional `sessionId`. Fall back to `run_workflow` only when the user explicitly names a template.
9. Do not replace WorkflowRuntime with opencode reasoning. Planner, Executor, Verifier, GoalKeeper, and routing must remain controlled by the configured workflow and Runtime.
10. Summarize the tool result:
   - decision
   - costLevel
   - riskLevel
   - enteredExecutor
   - verification pass / score
   - `summary.md` path
   - `trace.json` path
11. If execution did not enter Executor, explain the FeasibilityReport reason and recommended alternatives from the saved summary/context.
12. Include relevant memory summary, especially active confirmed scope, tried routes, rejected routes, and next actions.

## Profile Routing

- `rag-optimization`: run `task-negotiation` first. If human-confirmed scope is available, run `confirmed-scope-gate`, then proceed to feasibility. Do not modify production indexes, deploy, delete files, or call CodeExecutor from this profile by default.
- `coding-safe-fix`: use the safe code-fix chain. Execution requires explicit approval and hash-bound CodeChangePlan execution.
- `external-project-fix`: copy external projects into a temporary workspace and export a patch. Do not modify the source project directly.

If the user's task clearly does not match the active profile, recommend switching profile before running the workflow. Use:

```bash
npm run workflow:profiles
npm run workflow:profile
npm run workflow:profile:use -- --profile coding-safe-fix
```

The user only needs to provide goal, optional current state, and special constraints. Default rules come from `AGENTS.md`, `docs/WORKER_POLICY.md`, `docs/AUTONOMY_POLICY.md`, and the active profile.

## Scope Resume

When `run_profile_workflow` returns `pending_scope_confirmation`, show the `sessionId` and clarification questions. On the user's next `/workflow` message, if they say they are answering the previous questions, pass the answer back to `run_profile_workflow` instead of starting over:

```json
{
  "profileId": "rag-optimization",
  "sessionId": "<sessionId>",
  "answer": "..."
}
```

The tool will create a `ScopeConfirmationRecord`, run `confirmed-scope-gate`, and continue only within the profile's safe chain.

After scope resume, the runner writes Project Memory records for confirmed scope, human decisions, tried routes, blocked routes, and next actions. Later `/workflow` calls should use those memory records instead of asking the user to repeat confirmed boundaries.

## Default Tool Call Shape

```json
{
  "template": "<active profile defaultWorkflow>",
  "taskBrief": {
    "goal": "...",
    "currentState": "...",
    "constraints": [],
    "resources": [],
    "budget": "not specified",
    "successCriteria": [],
    "nonGoals": [],
    "rawUserInput": "..."
  }
}
```
