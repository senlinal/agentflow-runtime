# Contributing

Thanks for improving AgentFlow Runtime.

## Development Rules

- Keep `core/` independent from opencode.
- Keep workflow routing configuration-driven.
- Do not hardcode Planner / Executor / Verifier / GoalKeeper sequences in runtime.
- Do not bypass `SchemaValidator`.
- Do not add real LLM calls to tests.
- Do not commit `.env`, workflow run logs, policy logs, local databases, `node_modules`, `dist`, or coverage output.

## Setup

```bash
npm run doctor
npm run demo
npm run test
npm run typecheck
```

## Before Opening A PR

Run:

```bash
npm run verify
```

For a faster release-oriented check:

```bash
npm run repo:check
```

## Adding A New Workflow Template

1. Add the template under `workflows/`.
2. Validate it:

```bash
npm run workflow:validate -- --template <template-name>
```

3. Add or update tests when behavior changes.
4. Keep template names unique.

## Adding A New Role

1. Add a role definition under `roles/`.
2. Ensure `outputSchema` is supported by `SchemaValidator`.
3. Add a role prompt under `prompts/roles/` when it can be used by LLM nodes.
4. Add tests for catalog loading and prompt behavior when relevant.

## Adding LLM Behavior

- Use `LLMClient` and `LLMClientFactory`; do not instantiate providers from runtime.
- Use structured output and schema validation.
- Redact provider errors.
- Do not log API keys, authorization headers, or `reasoning_content`.
- Keep execute-mode smoke tests manual and opt-in.

## Security

Report security issues privately. See `SECURITY.md`.
