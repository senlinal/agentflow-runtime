# AgentFlow MCP Workflow Entry

Use this local MCP server as the primary OpenCode runtime entry for AgentFlow.

## Problem

OpenCode slash commands are prompt templates. They can still show command text or trigger the model's own supervisor behavior if no real runtime tool is available.

The stable runtime entry is:

```text
mcp/agentflow-server.ts
```

It exposes one tool:

```text
run_profile_workflow
```

The older `.opencode/tools/run_profile_workflow.ts` file is a compatibility wrapper only. It intentionally does not call `tool(...)`, because duplicate custom tool registration caused OpenCode runtime schema errors before AgentFlow could run.

If a live OpenCode session still reports:

```text
undefined is not an object (evaluating 'p.split')
```

restart OpenCode so it reloads `opencode.json` and uses the `agentflow` MCP tool instead of a stale custom tool instance.

## Configuration

`opencode.json` contains:

```json
{
  "mcp": {
    "agentflow": {
      "type": "local",
      "command": ["node", "--experimental-strip-types", "mcp/agentflow-server.ts"],
      "enabled": true
    }
  }
}
```

## Immediate Fallback

If the MCP tool is not available in the OpenCode session, run AgentFlow from the project terminal:

```bash
npm run workflow:run-profile -- --task "<task>"
```

The MCP tool returns:

- `formattedText`
- `roleTimeline`
- `routingDecision`
- `autonomyDecision`
- `executedWorkflows`
- `summaryPath`
- `tracePath`
- `contextPath`
- `warnings`
- `nextActions`
- `sessionId`
- `pendingQuestions`

The `/workflow` command should display only `formattedText`.

## Safety Boundaries

- Do not run real LLM smoke tests.
- Do not process `ai-daily/`.
- Do not expose command protocol text to the user.
- Do not generate a generic supervisor plan when AgentFlow cannot be started.
