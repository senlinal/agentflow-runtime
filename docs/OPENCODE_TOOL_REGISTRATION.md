# OpenCode Tool Registration

## Current Diagnosis

AgentFlow exposes `run_profile_workflow` for opencode through `.opencode/tools/run_profile_workflow.ts`.

OpenCode custom tools are not registered just because a TypeScript file exports a normal function. The current OpenCode custom tool contract expects a tool definition, normally created with `tool()` from `@opencode-ai/plugin`, and the default tool name comes from the filename.

This means:

- `.opencode/tools/run-profile-workflow.ts` exists as a compatibility wrapper and can be used for direct JSON-stdin checks.
- `.opencode/tools/run_profile_workflow.ts` is the actual OpenCode custom tool registration file.
- `npm run opencode:check` verifies file shape and quiet command text, but it cannot prove what a live opencode TUI session has loaded.
- Runtime availability must still be confirmed inside opencode by checking the available tools list.

## Expected Tool

Expected opencode tool name:

```text
run_profile_workflow
```

Expected behavior:

- Input: `task`, optional `profile`, optional resume fields, `dryRun`, `allowExecution`.
- Output: `formattedText`, `roleTimeline`, `routingDecision`, `autonomyDecision`, `executedWorkflows`, `summaryPath`, `tracePath`, `contextPath`, and `nextActions`.

## Fallback

If the live opencode session does not show `run_profile_workflow`, use the CLI fallback from a project terminal:

```bash
npm run workflow:run-profile -- --task "<task>"
```

This fallback is explicit. The `/workflow` command should not invent a supervisor plan when neither the custom tool nor a shell fallback is available.

## Future Options

If OpenCode custom tool loading is unavailable in a deployment environment, use one of these routes:

1. Register the tool using the OpenCode-supported custom tool mechanism for that version.
2. Wrap `ProfileWorkflowRunner` as an MCP server tool.
3. Keep using the CLI fallback until runtime tool registration is confirmed.
