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
      "command": [
        "env",
        "AGENTFLOW_PROJECT_ROOT=.",
        "node",
        "--experimental-strip-types",
        "mcp/agentflow-mcp-server.ts"
      ],
      "enabled": true
    }
  }
}
```

## Global OpenCode Use

AgentFlow can be installed as a global OpenCode integration so the plugin-owned `agentflow <task>` entry works from any workspace:

```bash
npm run opencode:install-global -- --dry-run
npm run opencode:install-global
```

The installer registers the AgentFlow policy and workflow interceptor plugins, copies AgentFlow subagent files, removes the old global markdown `/workflow` command if present, and configures the MCP server with an absolute `AGENTFLOW_PROJECT_ROOT`. Runtime assets such as `profiles/`, `workflows/`, `.workflow-runs/`, and `.agentflow/` stay under the AgentFlow repository. The workspace where OpenCode is opened remains the active project for any later project work.

Restart OpenCode after changing this file. The available tools should include:

- `agentflow_run_profile_workflow`
- `agentflow_list_profiles`
- `agentflow_inspect_profile`
- `agentflow_show_last_run`

`run_profile_workflow` remains as a compatibility alias, but plugin-owned entries should prefer `agentflow_run_profile_workflow`.

## Smoke Test

```bash
npm run mcp:agentflow:smoke
```

The smoke test runs `agent-workforce-basic` through `ProfileWorkflowRunner` and verifies `runtimeProof.runtimeStarted=true`, `roleTimeline.length > 1`, and `roleSource=subagent_dispatch_trace`.

It does not call a real LLM and does not call `CodeExecutor`.

## Tools

`agentflow_run_profile_workflow` accepts `task`, optional `profile`, optional resume fields, and safety booleans `allowExecution=false` and `allowLLM=false`.

It returns `formattedText`, `runtimeProof`, `roleTimeline`, `profileId`, `routingDecision`, `executedWorkflows`, `summaryPath`, `tracePath`, `contextPath`, `warnings`, and `nextActions`.

Profiles with LLM-backed workflow nodes are blocked unless `allowLLM=true`. The OpenCode entry defaults to `agent-workforce-basic` with `allowLLM=false`; run the LLM-backed profile only through an explicit CLI pilot.

`agentflow_list_profiles` returns all workflow profiles.

`agentflow_inspect_profile` returns a profile, validation result, and workflow chain.

`agentflow_show_last_run` returns the latest `.workflow-runs` summary, trace, and context paths.

## OpenCode Entry Behavior

Use this OpenCode entry:

```text
agentflow <task>
```

`@agentflow <task>` is also accepted. `/workflow` is only a best-effort compatibility path if the plugin receives the raw input.

Markdown slash commands are not the runtime entrypoint. OpenCode can expand them into visible `<auto-slash-command>` prompt text before plugins can hide the template. If `<auto-slash-command>` appears, the old markdown `/workflow` command is still installed or the wrong entry was used.

The workflow plugin interceptor calls `agentflow_run_profile_workflow`, displays only `formattedText`, and applies the rule: No trace, no agent. Normal output should contain `AgentFlow Runtime`, `Runtime Proof`, `Role Timeline`, `summaryPath`, and `tracePath`.

If MCP is not loaded, the interceptor returns this explicit CLI fallback:

```bash
npm run workflow:run-profile -- --profile agent-workforce-basic --task "<task>"
```

Do not let OpenCode generate a generic Supervisor plan and present it as an AgentFlow run.
