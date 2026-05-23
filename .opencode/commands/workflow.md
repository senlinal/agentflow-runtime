# /workflow

Use this command to run the repository's workflow template runner from opencode using the active workflow profile.

## Usage

`/workflow <goal, current state, optional constraints>`

## Instructions

1. Read `AGENTS.md`.
2. Read `profiles/current.json`, then load the active profile from `profiles/<activeProfile>.json`.
3. Read the active profile's `policyFiles`.
4. Read or summarize existing `memoryFiles`; if a memory file is missing, record a warning and continue.
5. Convert the user's message into a structured TaskBrief:
   - `goal`
   - `currentState`
   - `constraints`
   - `resources`
   - `budget`
   - `successCriteria`
   - `nonGoals`
   - `rawUserInput`
6. Default to the active profile's `defaultWorkflow`. Do not ask the user to repeat default constraints already present in `AGENTS.md`, policy files, memory files, or the active profile.
7. Call the custom tool `run_workflow` with either:
   - `template` and `taskBrief`, or
   - `template` and `inputPath` when the user points to an existing TaskBrief JSON file.
8. Do not replace WorkflowRuntime with opencode reasoning. Planner, Executor, Verifier, GoalKeeper, and routing must remain controlled by the configured workflow and Runtime.
9. Summarize the tool result:
   - decision
   - costLevel
   - riskLevel
   - enteredExecutor
   - verification pass / score
   - `summary.md` path
   - `trace.json` path
10. If execution did not enter Executor, explain the FeasibilityReport reason and recommended alternatives from the saved summary/context.

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
