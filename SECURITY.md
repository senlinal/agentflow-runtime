# Security Policy

## Supported Versions

This repository is currently pre-1.0. Security fixes target the current `main` branch.

## Reporting A Vulnerability

Please do not open a public issue for secrets, command execution bypasses, or provider credential leaks.

Report privately through the repository owner's preferred private channel. Include:

- affected file or command;
- reproduction steps;
- expected vs actual behavior;
- whether secrets, filesystem writes, or external calls are involved.

## Security Model

- Default workflows use `MockLLMClient`.
- Real LLM calls are opt-in and require explicit provider configuration.
- Tests must not call external providers.
- API keys must stay in environment variables and must not be committed.
- Workflow runs are written under `.workflow-runs/` and ignored by Git.
- Policy audit logs are written under `.opencode/policy-runs/` and ignored by Git.
- The opencode policy plugin is a guardrail, not a full sandbox.

## High-Risk Areas

- shell command classification;
- file deletion approval;
- approval replay integrity;
- LLM provider error redaction;
- template validation;
- schema validation before context writes.

## Maintainer Checklist

Before release:

```bash
npm run release:check
npm run verify
```

Never run `npm run llm:smoke -- --execute` as part of automated release checks.
