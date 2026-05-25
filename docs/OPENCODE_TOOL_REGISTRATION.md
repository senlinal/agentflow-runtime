# OpenCode Tool Registration

## Current Diagnosis

AgentFlow exposes `agentflow_run_profile_workflow` for opencode through the local MCP server configured in `opencode.json`:

```text
mcp/agentflow-mcp-server.ts
```

The previous `.opencode/tools/run_profile_workflow.ts` custom tool registration could appear as an available tool in some OpenCode sessions, but it failed before reaching AgentFlow with runtime schema errors such as:

```text
undefined is not an object (evaluating 'p.split')
```

That failure happens in OpenCode's custom tool loading path, not in `ProfileWorkflowRunner`. To avoid duplicate tool registration and schema parser drift, the file is now only a compatibility wrapper for direct checks. The live tool should come from the `agentflow` MCP server.

This means:

- `.opencode/tools/run-profile-workflow.ts` exists as a compatibility wrapper and can be used for direct JSON-stdin checks.
- `.opencode/tools/run_profile_workflow.ts` is also a compatibility wrapper and should not register a duplicate custom tool.
- `mcp/agentflow-mcp-server.ts` is the actual runtime tool provider.
- `mcp/agentflow-server.ts` is a compatibility wrapper.
- `npm run opencode:check` verifies file shape, MCP config, workflow interceptor registration, and that the old markdown `/workflow` command is not registered, but a live opencode session must still be restarted to pick up MCP/plugin config changes.
- `.opencode/plugins/agentflow-workflow-interceptor.ts` owns the `agentflow <task>` and `@agentflow <task>` entries. It calls the MCP dispatcher directly and avoids the markdown slash command prompt path.

## Expected Tool

Expected opencode tool names:

```text
agentflow_run_profile_workflow
agentflow_list_profiles
agentflow_inspect_profile
agentflow_show_last_run
```

`run_profile_workflow` remains as a compatibility alias.

Expected behavior:

- Input: `task`, optional `profile`, optional resume fields, `dryRun`, `allowExecution`.
- Output: `formattedText`, `roleTimeline`, `routingDecision`, `autonomyDecision`, `executedWorkflows`, `summaryPath`, `tracePath`, `contextPath`, and `nextActions`.

The AgentFlow entry should not fall back to model analysis, search-mode, or a Supervisor Research Plan. If the MCP tool is unavailable, it should state that AgentFlow Runtime was not started and show the CLI fallback.

Markdown `/workflow` is not an execution entry. If OpenCode displays `<auto-slash-command>`, an old project or global markdown command is still installed and must be removed.

## Fallback

If the live opencode session does not show `agentflow_run_profile_workflow` under the `agentflow` MCP server after restart, use the CLI fallback from a project terminal:

```bash
npm run workflow:run-profile -- --profile agent-workforce-basic --task "<task>"
```

This fallback is explicit. The plugin should not invent a supervisor plan when neither the MCP tool nor a CLI fallback is available.

## Future Options

If MCP tool loading is unavailable in a deployment environment, use one of these routes:

1. Fix the OpenCode MCP config for the local environment.
2. Keep using the CLI fallback until runtime tool registration is confirmed.
3. Revisit OpenCode custom tool registration only after confirming its schema contract for the installed OpenCode version.

The MCP route is documented in `docs/OPENCODE_MCP_AGENTFLOW.md`.
