# OpenCode Native Subagents

AgentFlow now distinguishes three layers:

1. Workflow node: the configuration-driven runtime step, such as Planner or Verifier.
2. AgentFlow internal subagent: the artifact-backed dispatch record under `.workflow-runs/<runId>/subagents/<subAgentId>/`.
3. OpenCode native subagent: an OpenCode `mode: subagent` agent definition under `.opencode/agents/` that can appear in OpenCode UI when OpenCode itself dispatches it.

## Current OpenCode Capability

Verified locally against the installed OpenCode plugin package and the current OpenCode agent files:

- Custom subagents are supported through markdown agent definitions in `.opencode/agents/*.md` with `mode: subagent`.
- Manual invocation through agent names such as `@agentflow-planner` is supported by OpenCode's native agent mechanism.
- Primary agents can ask for subagent work when OpenCode chooses to route a task to a configured subagent.
- The current plugin hook surface exposes chat, command, tool, and text-completion hooks, but no documented programmatic dispatch API for creating an OpenCode native subagent task from AgentFlow code.
- No documented plugin/MCP API is available here to read an OpenCode native `openCodeTaskId`, `openCodeSessionId`, or subagent output after dispatch.
- UI click-through is available only when OpenCode creates the native subagent task. AgentFlow internal artifacts alone do not create a clickable OpenCode native task.

Unknowns should remain unknown until OpenCode exposes or documents the corresponding API. AgentFlow must not infer task ids from prose or fabricate task/session ids.

## Configured AgentFlow Subagents

AgentFlow defines these OpenCode native subagent configs:

- `@agentflow-planner`
- `@agentflow-debater`
- `@agentflow-planner-revision`
- `@agentflow-executor`
- `@agentflow-verifier`
- `@agentflow-goalkeeper`

The mapping lives in `config/opencode-subagents.json`. Each file declares role, responsibilities, input expectation, output expectation, allowed tools, forbidden actions, file-modification policy, and tool-launching policy.

## Bridge Behavior

`core/opencode/OpenCodeSubAgentBridge.ts` converts an AgentFlow role into an OpenCode native dispatch request record. In the current OpenCode runtime it writes the intended prompt under:

`.workflow-runs/<runId>/opencode-native/<dispatchId>/prompt.md`

Because programmatic dispatch is unavailable, the result is:

- `status: unavailable`
- `openCodeNativeSubAgent: false`
- no `openCodeTaskId`
- no `openCodeSessionId`
- limitations explaining the missing OpenCode API

This is intentional. Without an OpenCode native task record, AgentFlow cannot claim that an OpenCode native subagent was dispatched.

## Profiles

`agent-workforce-basic` uses AgentFlow internal subagent artifacts only.

`agent-workforce-opencode` uses `dispatchMode: hybrid`: it still writes AgentFlow internal subagent artifacts, then records whether OpenCode native dispatch is available. With the current OpenCode API, Role Timeline shows `openCodeNativeSubAgent=false` and `nativeDispatchStatus=unavailable`.

## Manual Use

You can manually call configured OpenCode native subagents when OpenCode supports `@agent` routing:

`@agentflow-planner Review this AgentFlow trace and summarize the plan evidence: <trace path>`

Manual invocation is not the same as AgentFlow programmatic dispatch. It may create an OpenCode UI subagent task, but AgentFlow cannot currently capture that task id.

## UI Verification

To claim OpenCode native subagent execution, the run must have native evidence:

- `openCodeNativeSubAgent=true`
- `openCodeAgentName`
- `nativeDispatchStatus=dispatched` or `completed`
- an OpenCode-provided `openCodeTaskId` or equivalent task trace when available

If these fields are absent or `nativeDispatchStatus=unavailable`, the run is only AgentFlow internal subagent dispatch, not OpenCode native subagent execution.
