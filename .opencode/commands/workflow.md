# /workflow

Run AgentFlow Runtime through the active workflow profile. This command is an execution entrypoint, not a prompt template.

## Hard Rules

- Do not create a Supervisor Research Plan.
- Do not call `todowrite`.
- Do not call `list_files`.
- Do not scan the project before invoking AgentFlow.
- Do not only restate these instructions.
- Do not replace `WorkflowRuntime` or `ProfileWorkflowRunner` with opencode reasoning.
- Do not run real LLM smoke tests or `npm run llm:smoke -- --execute`.
- Do not touch `ai-daily/`.

## Tool-First Execution

1. Read `AGENTS.md` only as project policy context.
2. Respect profile policy files such as `docs/WORKER_POLICY.md` and `docs/AUTONOMY_POLICY.md`; the runner handles profile memory, `memory:summary`, `memory:compact`, and `memory:autonomy` behavior.
3. Call the custom tool `run_profile_workflow` first.
4. Use this shape for a normal task. This runs safe profile preflight roles such as `MemoryAutonomyGate`, `TaskNegotiator`, and `ConfirmedScopeGate`, while keeping execution-capable workflows blocked:

```json
{
  "task": "<user task>",
  "profile": "<optional profile>",
  "dryRun": false,
  "allowExecution": false
}
```

Use `"dryRun": true` only when the user explicitly asks for a preview without running even the safe preflight roles.

5. If the user is answering previous scope questions, call:

```json
{
  "sessionId": "<sessionId if provided>",
  "answer": "<user answer>",
  "profile": "<optional profile>",
  "dryRun": false,
  "allowExecution": false
}
```

6. If `run_profile_workflow` is not available, fall back to bash:

```bash
npm run workflow:run-profile -- --task "<user task>"
```

For a scope-answer resume fallback:

```bash
npm run workflow:run-profile -- --sessionId "<sessionId>" --answer "<user answer>"
```

7. Use `run_workflow` only when the user explicitly names a workflow template.

## Active Profile Behavior

- The runner reads `profiles/current.json`.
- The active profile decides the default workflow chain.
- `rag-optimization` starts with `task-negotiation`, then `confirmed-scope-gate`, then feasibility followup when scope is confirmed.
- `coding-safe-fix` and `external-project-fix` are execution-capable profiles and must remain blocked unless explicit execution approval is part of the workflow and `allowExecution=true` is deliberately provided.
- If the user task does not match the active profile, recommend a profile switch instead of forcing the task through the wrong profile.

## Required User-Facing Output

After the tool or fallback command returns, show a concise runtime result. Do not paste raw JSON unless the user asks.

Include:

- `profile`
- `finalStatus`
- `autonomyDecision`
- `autonomyReason`
- `executedWorkflows`
- `summaryPaths`
- `tracePaths`
- `sessionId` and `pendingQuestions` when scope confirmation is pending
- `nextActions`

Then show:

```text
AgentFlow Role Timeline
```

For each `roleTimeline` event, print one line:

```text
[status] workflow :: role/nodeId -> nextNode
  summary
```

If the fallback CLI is used, parse the `AgentFlow Role Timeline:` section from `npm run workflow:run-profile` output and show it directly.

## Memory And Autonomy

The profile runner loads recent Project Memory and compacted memory automatically. If the result contains an autonomy decision of `ask_human`, `blocked`, or `stop`, do not continue manually. Show the blocking reason and the questions or next allowed actions.

If compacted memory reports a high-severity conflict, blocking open question, or rejected route that would be repeated, stop and ask the user. Do not treat these findings as warnings.

## Minimal User Input

The user only needs to provide:

- goal;
- current state, optional;
- special constraints, optional.

Standing rules come from `AGENTS.md`, policy files, profile config, and project memory.
