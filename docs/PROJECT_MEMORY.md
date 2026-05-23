# Project Memory

This file is a human-readable seed for project memory. Runtime memory records are stored locally under `.agentflow/project-memory/` and are ignored by Git.

Use project memory to preserve confirmed scope, important decisions, tried routes, rejected routes, open questions, current best understanding, and next actions across profile-aware workflow runs.

The CLI entrypoints are:

```bash
npm run memory:list
npm run memory:summary -- --profile rag-optimization
npm run memory:compact -- --profile rag-optimization
npm run memory:show -- --id <memoryId>
```

Do not store secrets, API keys, credentials, production data, or private tokens in memory records.

`memory:compact` creates a stable summary of current facts, active decisions, rejected routes, open questions, resolved questions, next actions, and conflicts. It does not call an LLM and does not execute workflow steps.
