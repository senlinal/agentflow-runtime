# SubAgent Dispatch

`SubAgentDispatcher` creates one artifact directory per executed workflow node under:

```text
.workflow-runs/<runId>/subagents/<subAgentId>/
```

Each directory contains `input.json`, `output.json`, `metadata.json`, `prompt.md`, and `summary.md` when available. These artifacts prove that a runtime node was dispatched; they do not by themselves prove a real LLM call.

## Metadata Rules

`metadata.json` records:

- `executorType`
- `isMock`
- `isLLMBacked`
- `modelProvider`
- `modelName`
- `callStatus`
- input, output, and metadata artifact paths

`isLLMBacked=true` is allowed only when the runtime has a non-mock LLM call record for that node. A node configured as `type: "llm"` but missing a call record remains `isLLMBacked=false`. A call record with `provider=mock` or `model=mock-structured` is also not LLM-backed proof. Completed DeepSeek calls should show `modelProvider=deepseek`, `modelName=deepseek-v4-flash` or the configured model, and `callStatus=completed`.

Mock dispatches are valid runtime simulations, but they must stay labeled `isMock=true`, `isLLMBacked=false`, and `callStatus=not_applicable`.

## Workforce Profiles

`agent-workforce-basic` is a mock subagent simulation profile. It demonstrates Planner, Debater, PlannerRevision, Executor, Verifier, and GoalKeeper as runtime-traced roles without claiming real LLM-backed intelligence.

`agent-workforce-llm` is the opt-in LLM-backed pilot profile. It uses DeepSeek only for thinking roles: Planner, Debater, PlannerRevision, and GoalKeeper. Executor and Verifier stay mock in the pilot so a small answer task can be tested without CodeExecutor or external project execution.

Run the pilot only with explicit approval:

```bash
npm run workflow:run-profile -- \
  --profile agent-workforce-llm \
  --task "解释一下咖啡的做法" \
  --allow-llm
```

Without `--allow-llm`, the profile runner blocks before runtime execution. If the active provider is still `mock`, or if a DeepSeek credential is missing, it also blocks before runtime execution.
