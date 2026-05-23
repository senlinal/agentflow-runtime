# Composable Agent Workflow MVP

This OpenCode-side package contains a minimal deterministic workflow runtime for composable AgentNode orchestration.

## Run

```bash
npm run demo
```

The demo uses `examples/workflow.yaml` and `MockLLMClient`. It intentionally fails verification once, routes through GoalKeeper, then returns to PlannerRevision and passes on the second verification.

## Structure

```text
src/core/schemas.ts          TaskSpec, Plan, Critique, RevisedPlan, ExecutionResult,
                             VerificationReport, CorrectionHint, WorkflowTrace schemas
src/core/AgentNode.ts        Reusable AgentNode abstraction
src/core/WorkflowGraph.ts    YAML/JSON config loader and edge resolver
src/core/WorkflowRuntime.ts  Deterministic scheduler and trace recorder
src/llm/LLMClient.ts         Replaceable LLM client interface
src/llm/MockLLMClient.ts     Mock role behavior for demo and local testing
src/demo.ts                  CLI demo entry
examples/workflow.yaml       Planner -> Debater -> PlannerRevision -> Executor ->
                             Verifier -> GoalKeeper loop
```

## Runtime Contract

- Runtime owns control flow and edge resolution.
- Agents read only declared `inputKeys` and write one structured `outputKey`.
- Outputs are validated with Zod schemas before entering Context.
- Verifier reports use `pass`, `score`, `failedCriteria`, `reason`, `nextAction`, and `feedbackToPlanner`.
- `maxIterations` stops failed verification loops.
- Every node execution appends a `WorkflowTrace` item.

## Replacing the Mock LLM

Implement `LLMClient.completeStructured()` and return JSON-compatible objects matching each node's `outputSchema`. The runtime does not depend on any model provider, so OpenAI, Claude, Qwen, or local models can be added behind the same interface.
