# Quickstart

This guide gets a fresh clone running with mock workflows only. No API key is required.

## 1. Clone

```bash
git clone <your-repo-url>
cd <repo>
```

## 2. Check The Environment

```bash
npm run doctor
```

The doctor command checks the Node version, required files, required npm scripts, sample templates, and whether local runtime files such as `.env` or `.workflow-runs/` are tracked by Git.

## 3. Run A Demo

```bash
npm run demo
```

This uses `MockLLMClient` and exercises the Planner -> Debater -> PlannerRevision -> Executor -> Verifier -> GoalKeeper loop.

## 4. Run A Reusable Workflow Template

```bash
npm run workflow -- --template research-feasibility-execute-verify --input inputs/feasible-task.json
```

The workflow first creates a `ResearchReport`, then a `FeasibilityReport`. If the task is feasible, it enters the Planner / Executor / Verifier flow. If it is too broad or too risky, it stops before execution.

Try the infeasible sample:

```bash
npm run workflow -- --template research-feasibility-execute-verify --input inputs/infeasible-task.json
```

## 5. Inspect Templates And Roles

```bash
npm run workflow:list
npm run workflow:roles
npm run workflow:inspect -- --template abcde-basic
npm run workflow:validate -- --template abcde-basic
```

## 6. Choose The Current Workflow Profile

Profile-aware runs use `profiles/current.json` to choose the active working template. Inspect and switch profiles with:

```bash
npm run workflow:profiles
npm run workflow:profile
npm run workflow:profile:inspect -- --profile rag-optimization
npm run workflow:profile:inspect -- --profile frontend-site-build
npm run workflow:profile:use -- --profile rag-optimization
```

The default `rag-optimization` profile starts with task negotiation, then uses confirmed scope as a gate before feasibility. `task-solving` is for explanations, definitions, how-to answers, and conceptual help. `goal-driven-task-solving` is for bounded adaptive attempts driven by verifier feedback. `coding-safe-fix` is for scoped code fixes, `external-project-fix` is for temp-workspace external project runs and patch export, and `frontend-site-build` is for personal sites, landing pages, static HTML/CSS/JS, and lightweight React/Next.js page work.

Check how a task will route before running it:

```bash
npm run workflow:route-profile -- --task "做一个仿 Claude.ai 风格的个人网站"
```

If the current profile is `rag-optimization`, this website task routes to `frontend-site-build` instead of forcing the wrong profile.

Run the active profile directly:

```bash
npm run workflow:run-profile -- --task "继续 RAG 召回优化，分析上一轮实验结果，给出下一步方案"
```

This runs safe profile-aware preflight steps. It does not call `CodeExecutor`, run test commands, or call real LLM providers by default.

Run the deliverable-centered task-solving demo:

```bash
npm run demo:task-solving-coffee
npm run workflow:run-profile -- --profile task-solving --task "解释一下咖啡的做法"
```

This preserves `TaskBrief.userRequest`, sets `expectedDeliverable.type=answer`, makes Executor return `deliverable.content`, and makes Verifier reject meta-only output.
Each role also writes subagent artifacts under `.workflow-runs/<runId>/subagents/<subAgentId>/`, and the Role Timeline reports `subAgentDispatched`, artifact paths, and whether the node was mock or LLM-backed.

The default text output includes `AgentFlow Profile Run`, `Routing Decision`, `AgentFlow Role Timeline`, summary paths, trace paths, context paths, warnings, and next actions. In OpenCode, use `/workflow <task>` or `/agentflow <task>` so the plugin calls `agentflow_run_profile_workflow` and shows that formatted runtime result instead of displaying internal command instructions.

To see a runtime-verified multi-agent workforce, run:

```bash
npm run workflow:run-profile -- --profile agent-workforce-basic --task "演示 Planner、Debater、Executor、Verifier 多角色协作"
npm run mcp:agentflow:smoke
```

The Role Timeline is built from `trace.json`. No trace means no displayed AgentFlow role.
Timeline rows include `executorType`, `isMock`, `isLLMBacked`, `modelProvider`, `modelName`, and `callStatus` when available. `executorType: mock` is labeled as `mock simulation, not LLM-backed`; `executorType: llm` is labeled as LLM-backed only when a matching LLM call record exists.

To inspect the OpenCode native subagent bridge:

```bash
npm run opencode:subagents
npm run workflow:run-profile -- --profile agent-workforce-opencode --task "演示 OpenCode native subagents"
```

This is a hybrid proof. It writes AgentFlow internal subagent artifacts and reports OpenCode native availability. In the current OpenCode API, programmatic native dispatch is unavailable, so the verified output should say `openCodeNativeSubAgent=false` and must not show a fake `openCodeTaskId`.

To hand work to OpenCode's own clickable native subagents, generate a workflow pack:

```bash
npm run workflow:native-pack -- --profile agent-workforce-basic --task "解释一下咖啡的做法"
```

Open the generated `DISPATCH.md`, create the listed `@agentflow-*` native subagent tasks in OpenCode, and make each one write its assigned `output.json`. Then collect:

```bash
npm run workflow:native-collect -- --run <runId>
```

Missing `output.json` files stay pending; AgentFlow does not fabricate completed native subagent output.

To run the goal-driven adaptive loop:

```bash
npm run workflow:validate -- --template goal-driven-task-solving
npm run workflow:run-profile -- --profile goal-driven-task-solving --task "解释一下咖啡的做法"
```

If the first attempt passes verification, the loop ends immediately. If verification fails with a repairable reason, the controller chooses the next safe untried route; attempts are recorded under `.workflow-runs/<runId>/attempts/`.

For OpenCode, restart the app after config changes and confirm the `agentflow` MCP tools are visible. The reliable entries are:

```text
/workflow 检查项目目前有什么不足
/agentflow 检查项目目前有什么不足
```

They should call `agentflow_run_profile_workflow` and display only its `formattedText`, including `AgentFlow Runtime`, `Runtime Proof`, `Role Timeline`, `summaryPath`, and `tracePath`. Plain `agentflow <task>` is only best effort in current OpenCode builds because ordinary chat messages cannot reliably abort model routing before a provider call. If `<auto-slash-command>` appears, an old markdown `/workflow` command is still installed.

Inspect the opt-in LLM-backed workforce profile without calling a provider:

```bash
npm run workflow:profile:inspect -- --profile agent-workforce-llm
```

Run the controlled LLM-backed pilot only when you intend a real provider call:

```bash
npm run workflow:run-profile -- \
  --profile agent-workforce-llm \
  --task "解释一下咖啡的做法" \
  --allow-llm
```

`agent-workforce-basic` is a mock subagent simulation. `agent-workforce-llm` uses a real provider for Planner, Debater, PlannerRevision, Executor, Verifier, and optional GoalKeeper. Executor is answer-only and does not call CodeExecutor. DeepSeek is the default pilot provider, and `openai-compatible` is accepted when fully configured.

If the run asks for scope confirmation, inspect and resume the profile session:

```bash
npm run workflow:profile:sessions
npm run workflow:profile:session -- --id <sessionId>
npm run workflow:run-profile -- --sessionId <sessionId> --answer "召回口径按 heading/file，不牺牲回答质量，不改生产索引，可以做 query rewrite 和 reranker 实验。"
```

Inspect project memory created by confirmed scopes and profile routes:

```bash
npm run memory:list -- --profile rag-optimization
npm run memory:summary -- --profile rag-optimization
npm run memory:compact -- --profile rag-optimization
npm run memory:autonomy -- --profile rag-optimization --task "continue RAG optimization"
npm run memory:show -- --id <memoryId>
```

## 7. Run Controlled Code-Test-Verify

For ambiguous or broad work, run task negotiation before feasibility or execution:

```bash
npm run demo:task-negotiation
```

This generates a `TaskNegotiationResult` with target module, ambiguity, clarification questions, proposed scope, blocked actions, and a recommended next step. It does not call `CodeExecutor`, does not modify files, and does not run tests.

Record and check a confirmed scope:

```bash
npm run demo:scope-confirmation
npm run scope:list
npm run scope:show -- --id <confirmationId>
npm run scope:gate -- --id <confirmationId>
```

The scope gate is a continuation gate only. It confirms whether the human-approved scope may proceed to feasibility. It does not execute code, run tests, or call `CodeExecutor`.

```bash
npm run workflow -- --template code-test-verify --input inputs/feasible-task.json
```

This template runs the controlled `CodeExecutor`, then the configured `TestRunner`, then a deterministic `type: "verify"` node that checks test status, diff evidence, blocked operations, and checkpoint metadata.

If verification fails, the template stops through `repairPlanBuilder -> humanApprovalGate` with a scoped repair plan and a pending human approval request. It does not automatically retry code execution.

Run the failing review-path demo:

```bash
npm run demo:code-test-repair-review
```

Run the approved materialization demo:

```bash
npm run demo:approved-repair-materialize
```

This converts an already approved `ScopedRepairPlan` into a non-executable `CodeChangePlan`. It does not write files, run tests, or call `CodeExecutor`.

Create a pending execution approval request for a materialized `CodeChangePlan`:

```bash
npm run demo:code-change-plan-execution-approval
```

This records a hash-bound request with `status=pending`. It does not apply the plan, run tests, or call `CodeExecutor`.

Generate an approved execution dry-run plan:

```bash
npm run demo:code-change-plan-execution-dry-run
```

This requires an approved execution approval record, verifies the `CodeChangePlan` hash, and creates a dry-run plan only. It still does not write files, run commands, run tests, call `CodeExecutor`, or consume approval.

Run the explicit controlled execution demo:

```bash
npm run demo:code-change-plan-execution
```

This uses a temporary workspace, requires an approved execution approval record, rechecks the `CodeChangePlan` hash, creates a checkpoint, applies only declared file operations, runs scoped tests, verifies the result, creates a rollback guide, and consumes the approval once. It does not support delete operations, high-risk shell, automatic approval, or destructive rollback.

Inspect persisted execution records and rollback guidance:

```bash
npm run execution:list
npm run execution:show -- --id <executionId>
npm run execution:rollback-guide -- --id <executionId>
```

Run the real-project E2E trial:

```bash
npm run demo:e2e-real-project
```

This copies a small fixture project to a temporary workspace, confirms the initial tests fail, applies an approved scoped `CodeChangePlan` to `src/calculator.ts`, reruns tests, verifies the result, and prints execution record query commands. The fixture original is not modified.

Run the external project import demo:

```bash
npm run demo:external-project-import
```

Run against a user-provided project path without modifying the source project:

```bash
npm run external:run -- --source /path/to/project --target src/file.ts --contentFile /path/to/fixed-file.ts --testCommand "npm run test"
```

The runner copies the project to a temporary workspace first, then writes patch and execution metadata for review.

Review exported patches:

```bash
npm run patch:list
npm run patch:show -- --id <patchExportId>
npm run patch:apply-guide -- --id <patchExportId>
npm run patch:verify -- --id <patchExportId>
```

Patch commands are read-only. They do not run `git apply`, do not run tests, and do not write changes back to the source project. `patch:verify` checks hash integrity, file scope, sensitive paths, deleted files, binary patches, and obvious dangerous command content before manual review.

## 8. LLM Config Dry-Run

```bash
npm run llm:config
npm run llm:smoke
```

`llm:smoke` is dry-run by default and does not call external providers. Do not run `--execute` unless you intentionally want a real provider call.

If `npm run llm:config` reports `provider: mock` or `hasApiKey: false`, do not run the LLM-backed profile. Configure DeepSeek or an OpenAI-compatible provider in the environment first. Role metadata without `modelProvider` and `callStatus=completed`, or with `mock-structured`, is not LLM-backed proof.

## 9. Full Local Verification

```bash
npm run verify
```

This runs release checks, doctor, opencode adapter checks, workflow validation, LLM dry-run checks, tests, and typecheck.
