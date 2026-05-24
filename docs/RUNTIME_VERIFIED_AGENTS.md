# Runtime Verified Agents

AgentFlow only treats a role as executed when the role appears in a `WorkflowRuntime` trace.

## No Trace, No Agent

Text such as `[Planner]` or `Supervisor plan` is not proof that an AgentFlow role ran. A role is shown in the AgentFlow Role Timeline only when it comes from `trace.json` and is marked with:

```text
source=runtime_trace
```

Each timeline row also shows `nodeType`, `executorType`, `isMock`, `isLLMBacked`, `modelProvider`, `modelName`, `callStatus`, and the configured OpenCode subagent target when those fields exist. `executorType` is read from the runtime trace, which is written from the workflow node configuration. It is not inferred from model prose.

If no trace exists, the formatter must say:

```text
AgentFlow Runtime trace not found. No verified agents can be displayed.
```

It must not infer roles from model text, OpenCode supervisor output, or markdown command instructions.

## Runtime Proof

Profile runs include a Runtime Proof block:

```text
Runtime Proof:
- runtimeStarted: true
- tracePath: .workflow-runs/.../trace.json
- verifiedRoleCount: 6
- roleSource: runtime_trace
```

If `runtimeStarted=false`, the run is not a verified multi-agent run.

## Agent Workforce Basic Profile

Use this profile to show the visible multi-agent workflow:

```bash
npm run workflow:run-profile -- --profile agent-workforce-basic --task "演示 Planner、Debater、Executor、Verifier 多角色协作"
```

The profile runs `abcde-basic`, whose runtime nodes include Planner, Debater, PlannerRevision, Executor, Verifier, and GoalKeeper. The output includes summary, trace, context, Runtime Proof, and Role Timeline.

These nodes use `executorType: mock`, so the timeline explicitly says `mock simulation, not LLM-backed`. This proves the orchestration node is real while making clear the role intelligence is simulated.

OpenCode subagents for AgentFlow roles live under `.opencode/agents/agentflow-*.md`. The `/workflow` command must first run AgentFlow Runtime, then dispatch an OpenCode Task subagent only for roles that appear in the runtime trace. This prevents a primary agent from inventing roles while still creating real child sessions for visible roles.

The OpenCode MCP smoke path returns the same runtime-proofed timeline:

```bash
npm run mcp:agentflow:smoke
```

The MCP tool must still obey: No trace, no agent.

## Agent Workforce LLM Profile

`agent-workforce-llm` points to `abcde-basic-llm`. In the current pilot, Planner, Debater, PlannerRevision, and GoalKeeper are configured as `type: "llm"` thinking roles. Executor and Verifier remain `type: "mock"` so the pilot can answer a small task without invoking CodeExecutor, external project execution, or destructive actions.

Inspect it without calling a real model:

```bash
npm run workflow:profile:inspect -- --profile agent-workforce-llm
npm run workflow:validate -- --template abcde-basic-llm
```

When it is explicitly run with a configured provider, timeline entries must say `executorType: llm`, `isLLMBacked: true`, and `note: llm-backed role execution`.

Run it only with explicit LLM approval:

```bash
npm run workflow:run-profile -- \
  --profile agent-workforce-llm \
  --task "解释一下咖啡的做法" \
  --allow-llm
```

The runner blocks this profile unless `--allow-llm` is present. If DeepSeek credentials are not configured, it blocks before the runtime starts. Use `npm run llm:config` to confirm `provider`, `model`, `hasApiKey`, and `warnings`.

An LLM-backed role requires a real LLM call record. A row or metadata file must include:

```text
executorType: llm
isMock: false
isLLMBacked: true
modelProvider: deepseek
modelName: deepseek-v4-flash
callStatus: completed
```

If `modelProvider` or `callStatus` is missing, the role must not be described as LLM-backed. Mock rows remain labeled `mock subagent simulation, not LLM-backed`.

If you need real node intelligence rather than a visible simulation, do not use `mock` nodes. Use `type: "llm"` with explicit provider configuration or add a subagent-backed executor/adapter that writes structured output through `SchemaValidator`. Mock output may be used to test routing and formatting, but it must not be presented as a real LLM or subagent result.

## Verification

To verify a displayed role:

1. Open the reported `trace.json`.
2. Confirm the role appears as a trace item.
3. Confirm the timeline entry says `source: runtime_trace`.
4. Confirm `executorType` matches the workflow node type.

No trace entry means no displayed AgentFlow role.
