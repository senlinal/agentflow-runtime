# Runtime Verified Agents

AgentFlow only treats a role as executed when the role appears in a `WorkflowRuntime` trace.

## No Trace, No Agent

Text such as `[Planner]` or `Supervisor plan` is not proof that an AgentFlow role ran. A role is shown in the AgentFlow Role Timeline only when it comes from `trace.json` and is marked with:

```text
source=runtime_trace
```

Each timeline row also shows `nodeType`, `executorType`, `isMock`, and `isLLMBacked`. `executorType` is read from the runtime trace, which is written from the workflow node configuration. It is not inferred from model prose.

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

These nodes use `executorType: mock`, so the timeline explicitly says `mock simulation, not LLM-backed`. This proves the orchestration is real while making clear the role intelligence is simulated.

## Agent Workforce LLM Profile

`agent-workforce-llm` points to `abcde-basic-llm`, where the same role sequence is configured as `type: "llm"` nodes. It is opt-in and should not be run unless real LLM configuration is explicitly provided.

Inspect it without calling a real model:

```bash
npm run workflow:profile:inspect -- --profile agent-workforce-llm
npm run workflow:validate -- --template abcde-basic-llm
```

When it is explicitly run with a configured provider, timeline entries must say `executorType: llm`, `isLLMBacked: true`, and `note: llm-backed role execution`.

## Verification

To verify a displayed role:

1. Open the reported `trace.json`.
2. Confirm the role appears as a trace item.
3. Confirm the timeline entry says `source: runtime_trace`.
4. Confirm `executorType` matches the workflow node type.

No trace entry means no displayed AgentFlow role.
