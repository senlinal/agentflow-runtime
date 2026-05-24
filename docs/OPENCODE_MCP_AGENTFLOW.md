# AgentFlow MCP for OpenCode

AgentFlow's stable OpenCode entrypoint is the local MCP server:

```bash
npm run mcp:agentflow
```

`opencode.json` starts the same server for OpenCode:

```json
{
  "mcp": {
    "agentflow": {
      "type": "local",
      "command": ["node", "--experimental-strip-types", "mcp/agentflow-mcp-server.ts"],
      "enabled": true
    }
  }
}
```

Restart OpenCode after changing this file. The available tools should include:

- `agentflow_run_profile_workflow`
- `agentflow_list_profiles`
- `agentflow_inspect_profile`
- `agentflow_show_last_run`

`run_profile_workflow` remains as a compatibility alias, but `/workflow` should prefer `agentflow_run_profile_workflow`.

## Smoke Test

```bash
npm run mcp:agentflow:smoke
```

The smoke test runs `agent-workforce-basic` through `ProfileWorkflowRunner` and verifies `runtimeProof.runtimeStarted=true`, `roleTimeline.length > 1`, and `roleSource=runtime_trace`.

It does not call a real LLM and does not call `CodeExecutor`.

## Tools

`agentflow_run_profile_workflow` accepts `task`, optional `profile`, optional resume fields, and safety booleans `allowExecution=false` and `allowLLM=false`.

It returns `formattedText`, `runtimeProof`, `roleTimeline`, `profileId`, `routingDecision`, `executedWorkflows`, `summaryPath`, `tracePath`, `contextPath`, `warnings`, and `nextActions`.

Profiles with LLM-backed workflow nodes are blocked unless `allowLLM=true`.

`agentflow_list_profiles` returns all workflow profiles.

`agentflow_inspect_profile` returns a profile, validation result, and workflow chain.

`agentflow_show_last_run` returns the latest `.workflow-runs` summary, trace, and context paths.

## /workflow Behavior

The slash command should call `agentflow_run_profile_workflow`, display only `formattedText`, and apply the rule: No trace, no agent.

If MCP is not loaded, use the explicit CLI fallback:

```bash
npm run workflow:run-profile -- --task "<task>"
```

Do not let OpenCode generate a generic Supervisor plan and present it as an AgentFlow run.
