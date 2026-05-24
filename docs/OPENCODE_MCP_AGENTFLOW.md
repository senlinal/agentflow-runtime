# AgentFlow MCP Fallback

Use this plan if a live OpenCode session does not load `.opencode/tools/run_profile_workflow.ts` into the available tools list.

## Problem

The project has a static OpenCode custom tool registration:

```text
.opencode/tools/run_profile_workflow.ts
```

The file uses OpenCode's `tool(...)` helper and passes static checks. However, a running OpenCode session may still not show `run_profile_workflow` in its available tools. That means AgentFlow Runtime cannot be launched from `/workflow` through the custom tool in that session.

## Immediate Fallback

Run AgentFlow from the project terminal:

```bash
npm run workflow:run-profile -- --task "<task>"
```

This prints the same formatted runtime output, including `AgentFlow Profile Run`, `Routing Decision`, `AgentFlow Role Timeline`, summary path, trace path, and next actions.

## MCP Route

If custom tool loading remains unavailable, wrap `ProfileWorkflowRunner` as an MCP server and expose:

```text
run_profile_workflow
```

Recommended tool output:

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

The MCP server should call `OpenCodeWorkflowToolService.runProfileWorkflow`, because that service suppresses Runtime console logs before returning structured output. It should not call `CodeExecutor` unless explicit execution approval is present.

## Safety Boundaries

- Do not run real LLM smoke tests.
- Do not process `ai-daily/`.
- Do not expose command protocol text to the user.
- Do not generate a generic supervisor plan when AgentFlow cannot be started.
