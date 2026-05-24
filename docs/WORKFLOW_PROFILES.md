# Workflow Profiles

Workflow profiles define the current working mode for `/workflow`.

`profiles/current.json` stores the active profile:

```json
{
  "activeProfile": "rag-optimization"
}
```

The active profile tells the agent which default workflow to run, which scope workflow to use, which follow-up workflows are relevant, and which policy or memory files should be read before acting.

## Built-in Profiles

### rag-optimization

Uses `task-negotiation` first, then `confirmed-scope-gate`, then feasibility. This profile is for retrieval, recall, answer-quality-aware RAG experiments, and knowledge-base optimization. It blocks production index changes and deployment by default.

### coding-safe-fix

Uses the controlled code-test-verify and approval chain. It is for small scoped fixes with tests, explicit execution approval, and no file deletion.

### external-project-fix

Uses the external project import and patch export flow. It copies external projects into a temporary workspace and exports patch guidance without modifying the source project.

### frontend-site-build

Uses `task-negotiation` first for single-page sites, landing pages, personal homepages, static HTML/CSS/JS, and lightweight React or Next.js page work. It defaults to local generation guidance, no deploys, no real LLM calls, no file deletion, and no automatic code execution. If a future step needs to modify an existing external project, it should use the external project import flow or an explicitly scoped workspace.

## Auto Profile Router

`/workflow` and `workflow:run-profile` run a rule-based profile router before executing the safe profile chain. The router detects common task categories:

- RAG, retrieval, knowledge base, recall, reranker, embedding, chunk, or query rewrite -> `rag-optimization`.
- Bug fixes, failing tests, scoped code changes, or refactors -> `coding-safe-fix`.
- External project paths, real project patch export, or manual patch review -> `external-project-fix`.
- Websites, personal sites, landing pages, HTML/CSS, React, Next.js, or Claude.ai-style page requests -> `frontend-site-build`.

If the task clearly mismatches `profiles/current.json`, the runner records the routing decision. Low-risk profile switches such as `rag-optimization` to `frontend-site-build` are allowed automatically when the user did not explicitly choose a profile. Execution-capable routes still remain guarded and blocked unless a dedicated explicit approval path is used.

## Commands

```bash
npm run workflow:profiles
npm run workflow:profile
npm run workflow:profile:use -- --profile rag-optimization
npm run workflow:profile:inspect -- --profile rag-optimization
npm run workflow:route-profile -- --task "做一个仿 Claude.ai 风格的个人网站"
npm run workflow:run-profile -- --task "继续 RAG 召回优化，分析上一轮实验结果，给出下一步方案"
```

`workflow:run-profile` executes the active profile's safe preflight chain. By default it does not run CodeExecutor, test commands, approved execution workflows, or real LLM providers. Execution-capable workflows are blocked unless a later explicit execution path is used.

The CLI text output is formatted for users. It shows `AgentFlow Profile Run`, routing, autonomy, `AgentFlow Role Timeline`, artifact paths, warnings, and next actions. opencode `/workflow` should prefer the `run_profile_workflow` tool and display its `formattedText`; if the tool is unavailable, it should fall back to `npm run workflow:run-profile -- --task "<task>"`.

## Profile Sessions

When task negotiation needs human scope confirmation, the profile runner saves a local profile session under `.agentflow/profile-sessions/`.

```bash
npm run workflow:profile:sessions
npm run workflow:profile:session -- --id <sessionId>
npm run workflow:run-profile -- --sessionId <sessionId> --answer "召回口径按 heading/file，不牺牲回答质量，不改生产索引，可以做 query rewrite 和 reranker 实验。"
```

The resume command creates a `ScopeConfirmationRecord`, runs `confirmed-scope-gate`, and continues only within the profile's safe workflow chain. The session store is local runtime state and is ignored by Git.

## Project Memory

Profile runs write durable local memory records under `.agentflow/project-memory/`. This memory is ignored by Git and is intended to prevent long-running tasks from losing confirmed scope, repeating failed routes, or asking for the same boundary decisions.

Recorded memory types include:

- `confirmed_scope`: human-confirmed task boundaries from `ScopeConfirmationRecord`.
- `decision`: key human decisions, including scope answers.
- `tried_route`: workflows that were already attempted.
- `rejected_route`: workflows blocked by missing scope, safety policy, or profile constraints.
- `next_action`: recommended next steps that later `/workflow` runs can reuse.

Use:

```bash
npm run memory:list -- --profile rag-optimization
npm run memory:summary -- --profile rag-optimization
npm run memory:compact -- --profile rag-optimization
npm run memory:autonomy -- --profile rag-optimization --task "continue RAG optimization"
npm run memory:show -- --id <memoryId>
```

`workflow:run-profile` loads recent memory summaries for the active profile and includes them in the result. Memory records must not contain secrets, credentials, API keys, or production data.

Compaction converts many local memory records into current facts, active decisions, rejected routes that should not be repeated without new evidence, open/resolved questions, next actions, and conflict warnings. If a compacted summary exists, later profile runs include it in the task resources.

## Memory-Aware Autonomy

Profile runs evaluate the current task against compacted memory before continuing. The gate returns an `AutonomyDecision` and can allow low-risk preflight, continue with explicit assumptions, ask the human, block repeated rejected routes, or stop.

High-severity memory conflicts, blocking open questions, and rejected routes marked do-not-repeat are not treated as harmless warnings. They stop the workflow chain before followup planning or execution-capable workflows can run.

## Daily Use

With a profile active, the user only needs to provide the goal, optional current state, and special constraints. Standing rules come from `AGENTS.md`, policy files, memory files, and the active profile.
