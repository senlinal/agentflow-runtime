# Human-Agent Collaboration Protocol

This workspace uses a judgment-centered human-in-the-loop workflow.

## Project Runtime Rule

This repository contains a reusable composable Agent workflow runtime. Before making substantial changes, read `docs/AGENT_POLICY.md` and preserve the separation between the independent core runtime and any shell or adapter layer.

opencode may be used as a command or custom tool entrypoint, but it must not bypass `WorkflowRuntime` or `WorkflowRunner` to decide Planner / Executor / Verifier / GoalKeeper flow on its own. Workflow routing remains configuration-driven.

Normal edits, local file creation, code changes, documentation updates, and local test runs can proceed without asking the user. Deleting existing project files, overwriting hard-to-recover artifacts, sending external messages, deploying, or changing production data requires user confirmation.

When a task appears too costly, too broad, or underspecified, produce or preserve a `FeasibilityReport` decision such as `ask_human`, `revise_goal`, or `stop` rather than blindly executing.

After adding runtime, adapter, workflow, schema, or tool behavior, run `npm run test` and `npm run typecheck`.

LLM provider smoke tests are dry-run by default. Do not run `npm run llm:smoke -- --execute` unless the user explicitly asks for a real provider call and supplies the needed environment out of band. Never write API keys into code, docs, trace, summary, audit logs, or committed files. Do not bypass `SchemaValidator`, and do not let `WorkflowRuntime` depend directly on any concrete provider. Treat LLM config warnings as actionable diagnostic information rather than noise.

Any opencode policy `ask` or `deny` decision should be written to the policy audit log. If there is a pending approval, do not bypass it by weakening classifiers, changing policy rules, or running the blocked operation through another path.

Approval replay must use the original `decisionId` and must pass tool call hash integrity. Do not manually replay an operation if the policy service reports a mismatch, consumed approval, rejected approval, or expired approval.

When investigating a policy block or replay, use `npm run policy:replay-history -- --id <decisionId>` first. Do not delete `.opencode/policy-runs` records or bypass replay history.

Real LLM calls are opt-in. Default templates should stay on `type: "mock"` unless the task explicitly asks for live model execution. Do not put API keys or provider tokens in trace, summary, audit logs, tests, or committed files.

Do not bypass `SchemaValidator` for LLM output, and do not make `WorkflowRuntime` depend on a concrete LLM provider. Provider selection belongs in `LLMClientFactory` / `LLMConfigLoader`.

`/workflow` uses `profiles/current.json` by default. Do not ask the user to repeat standing safety rules already captured by the active profile, `docs/WORKER_POLICY.md`, or `docs/AUTONOMY_POLICY.md`. The current profile decides the default workflow chain and policy context.

Use `rag-optimization` for complex RAG, retrieval, recall, and answer-quality workflows. Use `coding-safe-fix` for scoped code fixes. Use `external-project-fix` for external project import, temp-workspace execution, patch export, and manual review. If a user request does not fit the active profile, recommend switching profile before running a workflow.

`ai-daily/` is unrelated to this project. Do not read, modify, stage, commit, clean, or summarize `ai-daily/` unless the user explicitly changes scope.

## Operating Principle

Agents should do low-risk work autonomously and ask the human only at judgment, boundary, risk, or approval points.

Do not ask the human to "take a look" without a specific decision request.

## Start Every Task With

Before doing substantial work, identify:

1. Objective: what outcome the user actually wants.
2. Success criteria: how completion will be verified.
3. Constraints: time, scope, tools, files, external systems, style.
4. Risk level: what could go wrong if the agent is wrong.
5. Human checkpoints: where the human must decide or approve.

For simple tasks, do this silently and proceed.
For ambiguous or high-risk tasks, show the user a concise plan before changing anything.

## Permission Layers

Autonomous:

- Read files and documentation.
- Search code and logs.
- Summarize, compare, classify, and draft.
- Run safe local checks.
- Create plans, checklists, and non-final drafts.

Ask before:

- Editing important project files when the requested outcome is ambiguous.
- Reading secrets such as `.env`, credentials, private keys, or tokens.
- Installing dependencies or using network access when not already expected.
- Writing outside the current project.
- Making irreversible or hard-to-review changes.

Require explicit approval:

- Sending messages or emails.
- Publishing, pushing, deploying, releasing, paying, deleting, or changing production data.
- Committing on behalf of the user unless requested.
- Making legal, financial, medical, compliance, or contractual decisions.

## How To Ask The Human

When human input is needed, ask for a decision in this shape:

- Decision needed: one sentence.
- Options: 2-4 concrete choices.
- Recommendation: one choice with reasoning.
- Evidence: files, commands, sources, or observations behind the recommendation.
- Consequence: what happens next after approval.

Avoid vague questions such as "What should I do?" unless the task is genuinely open-ended.

## Agent Roles

Use specialized agents when available:

- Explore / Librarian: read-only codebase and documentation investigation.
- Oracle: explanation, conceptual judgment, second opinion.
- Metis: plan consultation.
- Momus: plan critique and risk review.
- Prometheus: plan building.
- Sisyphus / Atlas: execution and orchestration.

Prefer read-only agents for discovery before execution.
Prefer critique agents before large, risky, or externally visible changes.

## Parallel Work

Parallelize when subtasks are independent:

- One agent investigates existing code or docs.
- One agent checks risks or alternatives.
- One agent prepares an implementation or draft.

Do not duplicate the same work across agents.
Do not wait for side investigations unless they block the next action.

## Evidence Standard

Final answers should state:

- What changed or what was learned.
- What was verified.
- What remains uncertain.
- What decision, if any, still belongs to the human.

For research tasks, include source links.
For code tasks, include file paths and test results.

## Project Memory

Profile-aware workflow runs may store local memory under `.agentflow/project-memory/`. Use it to remember confirmed scope, key decisions, tried routes, rejected routes, open questions, current best understanding, and next actions. Do not store secrets, credentials, API keys, production data, or private tokens in memory records.

Before repeating scope questions or retrying a route, inspect recent memory with `npm run memory:summary -- --profile <profileId>` or the profile runner's memory summary. Do not delete project memory to bypass prior decisions.

## Stop Conditions

Stop and ask when:

- The task goal is unclear and multiple reasonable outcomes conflict.
- A required permission boundary is reached.
- The agent finds evidence that the original request may be unsafe or wrong.
- Continuing would produce large changes without a reviewable plan.
