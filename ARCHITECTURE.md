# Architecture

AgentFlow Runtime separates deterministic workflow control from role-specific agent behavior.

## Layers

```text
CLI / opencode adapter
  -> WorkflowRunner
    -> WorkflowRuntime
      -> WorkflowGraph
      -> NodeRegistry
      -> NodeExecutor
        -> MockLLMClient or LLMClient
```

## Core Runtime

`core/WorkflowRuntime.ts` is intentionally small. It:

- starts from `workflow.start`;
- executes configured nodes;
- validates node output with `SchemaValidator`;
- writes output to `WorkflowContext`;
- resolves edges with `ConditionEvaluator`;
- stops at `end` or `maxIterations`;
- records structured trace entries.

It does not hardcode Planner / Executor / Verifier behavior, provider behavior, feasibility decisions, or opencode behavior.

## Workflow Templates

`workflows/*.json` defines:

- workflow name, version, start node, and max iterations;
- nodes and their roles, types, input keys, output keys, and output schemas;
- edges and conditions;
- optional input schema and default policies.

`WorkflowTemplateRegistry` loads templates by name, filename, or path and rejects duplicate names rather than choosing silently.

## Role Catalog

`roles/*.json` defines reusable role presets. A workflow node can use:

```json
{ "id": "planner", "rolePreset": "planner" }
```

The validator expands this through `RoleCatalog` so runtime nodes still have concrete `type`, `role`, `inputKeys`, `outputKey`, and `outputSchema`.

## Context And Schemas

Agents communicate through `WorkflowContext`, not direct free-form chat. Important context fields include:

- `taskBrief`
- `researchReport`
- `feasibilityReport`
- `plan`
- `critique`
- `revisedPlan`
- `executionResult`
- `verification`
- `correctionHint`
- `trace`
- `runtimeMetadata`

`SchemaValidator` validates role output before runtime writes it to context.

## LLM Adapter

LLM nodes are opt-in with `type: "llm"`. Default demos and tests use `type: "mock"`.

The LLM stack is:

- `LLMConfigLoader`
- `LLMClientFactory`
- `PromptRenderer`
- `OpenAICompatibleLLMClient`
- `StructuredOutputParser`
- `StructuredOutputRepairer`
- `SchemaValidator`

DeepSeek reuses the OpenAI-compatible client. Runtime does not know provider details.

## opencode Adapter

opencode files under `.opencode/` and `adapters/opencode/` are adapter layers. They call `WorkflowRunner` and policy services; they do not replace runtime routing.

The policy plugin delegates to:

- `OpenCodePolicyService`
- `ShellRiskClassifier`
- `FileOperationClassifier`
- `PolicyAuditLogger`
- `PolicyApprovalStore`
- `ApprovalReplayService`
- `PolicyReplayRunner`
- `PolicyTimelineService`

Policy replay is dry-run by default and only replays exact approved tool-call hashes.

## Persistence

Workflow runs are written under `.workflow-runs/` and ignored by Git.

Policy audit logs are written under `.opencode/policy-runs/` and ignored by Git.

These directories are runtime artifacts, not source files.
