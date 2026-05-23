# /workflow

Use this command to run the repository's workflow template runner from opencode.

## Usage

`/workflow <goal, current state, constraints, success criteria, optional template>`

## Instructions

1. Convert the user's message into a structured TaskBrief:
   - `goal`
   - `currentState`
   - `constraints`
   - `resources`
   - `budget`
   - `successCriteria`
   - `nonGoals`
   - `rawUserInput`
2. Default to template `research-feasibility-execute-verify` unless the user explicitly names another template.
3. Call the custom tool `run_workflow` with either:
   - `template` and `taskBrief`, or
   - `template` and `inputPath` when the user points to an existing TaskBrief JSON file.
4. Do not replace WorkflowRuntime with opencode reasoning. Planner, Executor, Verifier, GoalKeeper, and routing must remain controlled by the configured workflow and Runtime.
5. Summarize the tool result:
   - decision
   - costLevel
   - riskLevel
   - enteredExecutor
   - verification pass / score
   - `summary.md` path
   - `trace.json` path
6. If execution did not enter Executor, explain the FeasibilityReport reason and recommended alternatives from the saved summary/context.

## Default Tool Call Shape

```json
{
  "template": "research-feasibility-execute-verify",
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
