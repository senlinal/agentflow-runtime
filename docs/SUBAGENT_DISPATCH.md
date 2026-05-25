# SubAgent Dispatch

`SubAgentDispatcher` creates one artifact directory per executed workflow node under:

```text
.workflow-runs/<runId>/subagents/<subAgentId>/
```

Each directory contains `input.json`, `output.json`, `metadata.json`, `prompt.md`, and `summary.md` when available. These artifacts prove that a runtime node was dispatched; they do not by themselves prove a real LLM call.

There are three distinct layers:

- workflow node: the configured `WorkflowRuntime` step;
- AgentFlow internal subagent: the artifact-backed dispatch record above;
- OpenCode native subagent: an OpenCode `mode: subagent` task created by OpenCode itself.

Internal subagent artifacts must not be described as OpenCode native subagents. OpenCode native proof requires OpenCode-native dispatch evidence such as `openCodeNativeSubAgent=true`, `openCodeAgentName`, and a native task id when the OpenCode API exposes one.

## Metadata Rules

`metadata.json` records:

- `executorType`
- `isMock`
- `isLLMBacked`
- `modelProvider`
- `modelName`
- `callStatus`
- input, output, and metadata artifact paths
- `dispatchMode`
- `openCodeNativeSubAgent`
- `openCodeAgentName`
- `nativeDispatchStatus`

`isLLMBacked=true` is allowed only when the runtime has a non-mock LLM call record for that node. A node configured as `type: "llm"` but missing a call record remains `isLLMBacked=false`. A call record with `provider=mock` or `model=mock-structured` is also not LLM-backed proof. Completed DeepSeek calls should show `modelProvider=deepseek`, `modelName=deepseek-v4-flash` or the configured model, and `callStatus=completed`.

Mock dispatches are valid runtime simulations, but they must stay labeled `isMock=true`, `isLLMBacked=false`, and `callStatus=not_applicable`.

## Workforce Profiles

`agent-workforce-basic` is a mock subagent simulation profile. It demonstrates Planner, Debater, PlannerRevision, Executor, Verifier, and GoalKeeper as runtime-traced roles without claiming real LLM-backed intelligence.

`agent-workforce-llm` is the opt-in LLM-backed pilot profile. It uses a real provider for Planner, Debater, PlannerRevision, Executor, Verifier, and optional GoalKeeper. Executor is answer-only in the pilot and must not call CodeExecutor, write files, or run external project execution. DeepSeek is the default acceptance provider; `openai-compatible` is accepted when fully configured.

`agent-workforce-opencode` is a hybrid OpenCode native subagent bridge profile. It still writes AgentFlow internal artifacts, then records OpenCode native dispatch availability. In the current OpenCode runtime, programmatic native dispatch is unavailable, so timeline rows show `openCodeNativeSubAgent=false` and `nativeDispatchStatus=unavailable` rather than fabricating OpenCode task ids.

Run the pilot only with explicit approval:

```bash
npm run workflow:run-profile -- \
  --profile agent-workforce-llm \
  --task "解释一下咖啡的做法" \
  --allow-llm
```

Without `--allow-llm`, the profile runner blocks before runtime execution. If the active provider is still `mock`, or if the selected real provider is missing an API key, it also blocks before runtime execution.
