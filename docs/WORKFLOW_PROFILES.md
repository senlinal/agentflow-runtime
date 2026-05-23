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

## Commands

```bash
npm run workflow:profiles
npm run workflow:profile
npm run workflow:profile:use -- --profile rag-optimization
npm run workflow:profile:inspect -- --profile rag-optimization
npm run workflow:run-profile -- --task "继续 RAG 召回优化，分析上一轮实验结果，给出下一步方案"
```

`workflow:run-profile` executes the active profile's safe preflight chain. By default it does not run CodeExecutor, test commands, approved execution workflows, or real LLM providers. Execution-capable workflows are blocked unless a later explicit execution path is used.

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
