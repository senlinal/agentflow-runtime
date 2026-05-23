# GitHub Release Checklist

Use this checklist before pushing the repository to GitHub.

## Required Checks

```bash
npm run release:check
npm run demo
npm run demo:feasible
npm run demo:infeasible
npm run workflow:list
npm run workflow:validate -- --template abcde-basic
npm run workflow:validate -- --template abcde-basic-llm
npm run workflow:inspect -- --template abcde-basic
npm run workflow:inspect -- --template abcde-basic-llm
npm run llm:config
npm run llm:smoke
npm run opencode:check
npm run test
npm run typecheck
```

Do not run `npm run llm:smoke -- --execute` during release checks unless a human explicitly requests a real provider call.

## Must Not Be Committed

- `.env`
- `.workflow-runs/`
- `.opencode/policy-runs/`
- `.opencode/opencode.db*`
- `.opencode/node_modules/`
- `node_modules/`
- `dist/`
- `coverage/`
- local runtime databases, pid files, and logs

## Manual Review

- README describes the current TypeScript runtime, not an older prototype.
- `.env.example` contains placeholders only.
- Workflow templates validate.
- opencode adapter remains an adapter; it does not bypass `WorkflowRuntime` or `WorkflowRunner`.
- Runtime flow remains configuration-driven.
- LLM provider usage remains opt-in.
- Policy replay remains dry-run by default.
