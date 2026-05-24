# OpenCode Adapter

## Relationship

The core workflow runtime is independent of opencode. `WorkflowRuntime` and `WorkflowRunner` control node execution, schema validation, trace writing, and edge-based routing.

opencode is only an outer shell for this phase. Commands under `.opencode/commands/` describe how a user can invoke workflows from the TUI, and the `agentflow` MCP server exposes the live `run_profile_workflow` tool. Files under `.opencode/tools/` are compatibility wrappers and older custom-tool adapters; they do not replace Planner, Executor, Verifier, GoalKeeper, or condition routing.

Plugin-level permission interception is handled by `.opencode/plugins/agentflow-policy.ts`. The plugin is an adapter only: it does not change workflow routing, node execution, schemas, or Runtime behavior.

## Command Usage

Default workflow run:

```text
/workflow 目标：基于当前 Runtime 增加一个模板运行能力。现状：已有 WorkflowRunner 和 MockLLMClient。约束：不接真实 LLM，不做 UI。验收：生成 trace 并通过测试。
```

The `/workflow` command is a quiet AgentFlow entrypoint. It should call the MCP `run_profile_workflow` tool first and display the returned `formattedText`, including the AgentFlow Role Timeline. It should not print the command file, expose internal policy text, or create a generic supervisor plan. If the MCP tool is unavailable and no shell fallback exists, it should tell the user to run `npm run workflow:run-profile -- --task "<task>"` in a project terminal.

Inspect a template:

```text
/workflow-inspect abcde-basic
```

Create a template from a spec:

```text
/workflow-create spec=template-specs/abcde-basic.json out=workflows/my-workflow.json name=my-workflow
```

## MCP Tool And Compatibility Wrappers

The live profile runner is provided by the local MCP server:

- `mcp/agentflow-server.ts` -> `run_profile_workflow`

Legacy compatibility wrappers still exist for direct JSON-stdin checks:

- `.opencode/tools/run_profile_workflow.ts` -> compatibility wrapper for profile runs
- `.opencode/tools/run-workflow.ts` -> `run_workflow`
- `.opencode/tools/run-profile-workflow.ts` -> compatibility wrapper for profile runs
- `.opencode/tools/list-workflows.ts` -> `list_workflows`
- `.opencode/tools/inspect-workflow.ts` -> `inspect_workflow`
- `.opencode/tools/validate-workflow.ts` -> `validate_workflow`
- `.opencode/tools/create-workflow.ts` -> `create_workflow`

Each tool delegates to `adapters/opencode/OpenCodeWorkflowToolService.ts`, which calls existing core services such as `WorkflowRunner`, `WorkflowTemplateRegistry`, and `TemplateCreateService`.

See `docs/OPENCODE_TOOL_REGISTRATION.md` for the distinction between a file existing under `.opencode/tools/` and the live opencode runtime actually showing the tool in its available tool list.

opencode does not choose or store LLM provider credentials. If a workflow uses `type: "llm"`, provider selection is handled inside the core layer through `LLMClientFactory` and `LLMConfigLoader`, including `openai-compatible` and `deepseek`. opencode tools should pass templates and inputs to `WorkflowRunner`; they must not save API keys, bypass `SchemaValidator`, or call model providers directly.

## Policy Plugin

`.opencode/plugins/agentflow-policy.ts` listens to `tool.execute.before` and delegates decisions to `OpenCodePolicyService`.

Allowed by default:

- `npm run demo`
- `npm run test`
- `npm run typecheck`
- `npm run workflow...`
- `node ...`
- read-only commands such as `cat`, `grep`, `rg`, `find`, `ls`, `pwd`
- ordinary `curl URL` calls that do not pipe into a shell
- creating new project files
- modifying existing project files

Requires confirmation (`ask`) by default:

- deleting existing project files
- `rm -rf` outside session-created temporary files
- `git reset --hard`
- `git clean -fd` / `git clean -xdf`
- `curl ... | sh`, `curl ... | bash`, `wget ... | sh`, `wget ... | bash`
- `sudo ...`
- `chmod -R` / `chown -R`
- project-external path operations
- writes to `.env`, private key, token, credential, or similar sensitive paths

The service layer is split into:

- `OpenCodePolicyService`
- `ShellRiskClassifier`
- `FileOperationClassifier`
- `OpenCodeSessionFileTracker`
- `PolicyAuditLogger`
- `PolicyApprovalStore`

`OpenCodeSessionFileTracker` is in-memory. If the opencode process restarts, it will not remember which files were created earlier in the session.

## Policy Audit Log

Policy decisions are written to `.opencode/policy-runs/`:

- `decisions.jsonl`: all `allow`, `ask`, and `deny` decisions
- `allowed.jsonl`: allowed decisions only
- `asked.jsonl`: confirmation-required decisions only
- `denied.jsonl`: denied decisions only
- `approvals.jsonl`: approve/reject records
- `pending/<decisionId>.json`: unresolved `ask` records

View recent decisions:

```text
npm run policy:audit
npm run policy:audit -- --limit 20 --action ask
```

View pending approvals:

```text
npm run policy:pending
```

Record a human approval or rejection:

```text
npm run policy:approve -- --id policy_... --note "Approved exact target."
npm run policy:reject -- --id policy_... --note "Use a safer scoped command."
```

Approval records are audit-only in this phase. They do not automatically resume a blocked command.

## Approval Replay

Approved records can be used for a single exact replay by passing the original `decisionId` as `approvalId`, `policyApprovalId`, `replayDecisionId`, or `approvedDecisionId` in the tool args.

Replay is allowed only when `ToolCallHasher` confirms the retry matches the approved tool call:

- same tool name
- same normalized args, excluding replay id fields
- same command
- same affected paths
- same project root

Successful replay writes a new audit record with `matchedRule: approval-replay` and marks the approval as `consumed`. A consumed approval cannot be used again. Rejected, expired, or hash-mismatched approvals are denied and audited.

## Replay History

Inspect a decision lifecycle:

```text
npm run policy:replay-history -- --id policy_...
npm run policy:replay-history -- --id policy_... --format json
```

The timeline includes:

- root decision id
- tool call hash
- current status
- decision events from `decisions.jsonl`
- approval events from `approvals.jsonl`
- replay events from `replays.jsonl`
- pending approval state from `pending/<decisionId>.json`
- warnings for malformed JSONL lines or missing timestamps

`policy:replay-history` is read-only. It does not execute commands, mutate approvals, or consume replay approvals.

## Current Limits

- Default workflows use `MockLLMClient`. Real LLM workflows are opt-in through `type: "llm"` nodes and core `LLMClientFactory`.
- opencode commands and tools call `WorkflowRunner`; they do not manage provider credentials directly.
- LLM provider selection, config warnings, and smoke-test behavior live in the core LLM adapter layer.
- API keys must stay in environment variables and must not be saved by opencode tools, workflow summaries, traces, or audit logs.
- No UI is included.
- The policy plugin uses static pattern matching, not a full shell AST.
- The session file tracker is in-memory.
- Approval CLI records decisions but does not replay blocked tool calls.
- Approval replay requires the tool caller to retry with the approved `decisionId`; it still does not auto-run commands by itself.
- Replay history is read-only and only reports what is present in local JSONL files.
- `.opencode/policy-runs/` is ignored by git and should not contain committed runtime logs.
- Workflow flow remains controlled by JSON templates and Runtime conditions.
