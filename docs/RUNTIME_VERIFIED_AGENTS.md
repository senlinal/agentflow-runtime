# Runtime Verified Agents

AgentFlow only treats a role as executed when the role appears in a `WorkflowRuntime` trace.

## No Trace, No Agent

Text such as `[Planner]` or `Supervisor plan` is not proof that an AgentFlow role ran. A role is shown in the AgentFlow Role Timeline only when it comes from `trace.json` and is marked with:

```text
source=runtime_trace
```

If no trace exists, the formatter must say that the runtime was not started or that the role timeline cannot be verified. It must not infer roles from model text, OpenCode supervisor output, or markdown command instructions.

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

## Verification

To verify a displayed role:

1. Open the reported `trace.json`.
2. Confirm the role appears as a trace item.
3. Confirm the timeline entry says `source: runtime_trace`.

No trace entry means no displayed AgentFlow role.
