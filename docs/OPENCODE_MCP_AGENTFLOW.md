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

AgentFlow can be installed as a global OpenCode integration so the plugin-owned `/workflow <task>` and `/agentflow <task>` entries work from any workspace:

```bash
npm run opencode:install-global -- --dry-run
npm run opencode:install-global
```

The installer registers the AgentFlow policy and workflow interceptor plugins, registers minimal config commands for `/workflow` and `/agentflow`, copies AgentFlow subagent files, removes the old global markdown `/workflow` command if present, removes the known provider-affecting `oh-my-openagent@latest` command-pack plugin from the global plugin chain, and configures the MCP server with an absolute `AGENTFLOW_PROJECT_ROOT`. Runtime assets such as `profiles/`, `workflows/`, `.workflow-runs/`, and `.agentflow/` stay under the AgentFlow repository. The workspace where OpenCode is opened remains the active project for any later project work.

Restart OpenCode after changing this file. The available tools should include:

- `agentflow_run_profile_workflow`
- `agentflow_native_pack`
- `agentflow_native_collect`
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

`agentflow_native_pack` accepts `task` and optional `profile`. It returns an OpenCode native workflow pack and a copyable dispatch prompt for `@agentflow-*` native subagents.

`agentflow_native_collect` accepts `run` or `runId`. It validates native subagent `output.json` artifacts and reports `source=opencode_native_artifact` rows. Missing outputs remain pending and are not fabricated.

Profiles with LLM-backed workflow nodes are blocked unless `allowLLM=true`. The OpenCode entry defaults to `agent-workforce-basic` with `allowLLM=false`; run the LLM-backed profile only through an explicit CLI pilot.

`agentflow_list_profiles` returns all workflow profiles.

`agentflow_inspect_profile` returns a profile, validation result, and workflow chain.

`agentflow_show_last_run` returns the latest `.workflow-runs` summary, trace, and context paths.

## Native Subagent Bridge

AgentFlow also ships OpenCode `mode: subagent` definitions for `@agentflow-planner`, `@agentflow-debater`, `@agentflow-planner-revision`, `@agentflow-executor`, `@agentflow-verifier`, and `@agentflow-goalkeeper`.

Inspect them with:

```bash
npm run opencode:subagents
```

The MCP workflow result may include `dispatchMode`, `openCodeNativeSubAgent`, `openCodeAgentName`, `nativeDispatchStatus`, and limitations. In the current OpenCode plugin/MCP API, programmatic native subagent dispatch and task/session id reads are unavailable, so `agent-workforce-opencode` reports `openCodeNativeSubAgent=false` instead of fabricating a native task.

## OpenCode Entry Behavior

Use one of these OpenCode entries:

```text
/workflow <task>
/agentflow <task>
/agentflow native-pack <task>
/agentflow native-collect <runId>
```

Plain `agentflow <task>` and `@agentflow <task>` are best-effort compatibility paths only. In current OpenCode builds, ordinary chat messages cannot reliably stop model routing before the provider call, so use slash commands when you need a hard AgentFlow run.

Markdown slash command files are not the runtime entrypoint. OpenCode can expand them into visible `<auto-slash-command>` prompt text before plugins can hide the template. The supported slash entries are minimal config commands intercepted by `.opencode/plugins/agentflow-workflow-interceptor.ts`. If `<auto-slash-command>` appears, the old project or global markdown command is still installed.

The workflow plugin interceptor calls `agentflow_run_profile_workflow`, captures the tool result, and replaces the final OpenCode message with MCP `formattedText`. This prevents OpenCode or command-pack agents from summarizing away the Role Speech Transcript. Normal output should contain `AgentFlow Runtime`, `Runtime Proof`, `Role Timeline`, `AgentFlow 角色发言流`, `summaryPath`, and `tracePath`.

If MCP is not loaded, the interceptor returns this explicit CLI fallback:

```bash
npm run workflow:run-profile -- --profile agent-workforce-basic --task "<task>"
```

Do not let OpenCode generate a generic Supervisor plan and present it as an AgentFlow run.
