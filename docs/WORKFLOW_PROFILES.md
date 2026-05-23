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

## Daily Use

With a profile active, the user only needs to provide the goal, optional current state, and special constraints. Standing rules come from `AGENTS.md`, policy files, memory files, and the active profile.
