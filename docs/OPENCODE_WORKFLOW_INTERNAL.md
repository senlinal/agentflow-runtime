# OpenCode Workflow Internal Protocol

This document keeps the detailed `/workflow` behavior out of the slash command file so OpenCode does not display the full protocol to the user.

## Runtime Entry

`/workflow` is a quiet command. It should invoke `run_profile_workflow` first and show the returned `formattedText`. It must not replace AgentFlow with a generic supervisor plan.

The command should not call unavailable planning helpers, unavailable file listing helpers, shell fallback, or code execution tools unless the current runtime explicitly exposes them and the workflow state allows them.

## Profile Routing

`ProfileWorkflowRunner` reads `profiles/current.json`, routes the task with `ProfileRouter`, and switches profiles only when the router marks the switch safe and the user did not explicitly request a profile.

When OpenCode is opened outside the AgentFlow repository, `AGENTFLOW_PROJECT_ROOT` must point to the runtime repository. Runtime assets are resolved from that root, while the current OpenCode workspace remains the user's active project. Do not `chdir` into AgentFlow just to make `/workflow` work.

Current profile data controls:

- default workflow;
- scope workflow;
- follow-up workflows;
- policy files;
- memory files;
- default constraints and blocked actions.

## Memory And Autonomy

Profile runs load recent Project Memory and compacted memory. `MemoryAutonomyGate` can block or ask for human input when compacted memory contains high-severity conflicts, blocking open questions, or rejected routes that should not be repeated.

## Scope Resume

If a previous profile session is waiting for scope confirmation, a user answer should be passed to `run_profile_workflow` as `answer` and optionally `sessionId`. The runner creates or resumes the `ScopeConfirmationRecord`, runs `confirmed-scope-gate`, and either continues to follow-up workflows or returns next actions.

## Role Timeline

The user-facing result should show the `AgentFlow Role Timeline` from `formattedText`. The timeline summarizes each workflow node or gate with:

- workflow;
- role or node id;
- status;
- next node;
- output summary;
- summary, trace, and context paths when available.

## Subagent Dispatch

`/workflow` must not let a primary OpenCode agent merely role-play Planner, Executor, Verifier, or GoalKeeper. It should:

1. Run AgentFlow first through the local CLI shim or MCP tool.
2. Read only timeline entries marked `source: runtime_trace` or `source: subagent_dispatch_trace`.
3. Dispatch the matching `.opencode/agents/agentflow-*.md` subagent via the OpenCode Task tool for each verified role.
4. Include the trace path, context path, workflow, role, node id, output key, output schema, and output summary in the Task prompt.
5. Preserve the mock boundary: `isMock: true` means the runtime node output is a simulation, not real model-backed node intelligence.

The compact `/workflow` output should still show role coordination and status for all verified timeline entries. It must not drop `subagent_dispatch_trace` rows, because those rows are the runtime-backed dispatch proof used by current AgentFlow profiles.

The runtime trace decides which subagents are allowed to run. OpenCode subagents provide child sessions and role visibility; they must not replace `WorkflowRuntime` routing or schema validation.

## Fallback

If `run_profile_workflow` is unavailable, do not pretend AgentFlow ran. If a shell tool is available, the safe CLI fallback is:

```bash
npm run workflow:run-profile -- --task "<task>"
```

If no shell tool is available, tell the user to run that command in the project terminal.

## Execution Boundaries

Default profile runs do not call CodeExecutor. Execution-capable profiles remain blocked unless the workflow state includes explicit execution approval and the caller deliberately sets execution permission.

Do not process `ai-daily/` from `/workflow`; it is outside this project task.
