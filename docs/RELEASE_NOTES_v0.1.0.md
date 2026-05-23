# AgentFlow Runtime v0.1.0

## Summary

Reusable feasibility-aware workflow templates for coding agents, with OpenCode adapter, policy governance, audit / approval / replay, and DeepSeek/OpenAI-compatible LLM support.

## Included Features

- Workflow Runtime
- Workflow Template Runner
- RoleCatalog
- TemplateScaffolder
- TaskBrief input
- Feasibility Gate
- Mock LLM default mode
- OpenAI-compatible LLM adapter
- DeepSeek provider
- OpenCode commands / tools / policy plugin
- Policy audit log
- Pending approval records
- Approval replay with toolCallHash integrity
- Policy timeline / replay history
- GitHub-ready docs / CI / release checks

## Safety Properties

- Default mock mode
- No automatic real LLM calls
- No API key logging
- Risky tool calls intercepted by policy plugin
- Approval replay is hash-bound and single-use

## Current Limitations

- Coding Executor not implemented
- TestRunner not implemented
- UI not implemented
- Real LLM calls require explicit configuration
- DeepSeek/OpenAI-compatible provider only
- Policy shell risk classifier is static-rule based

## Verification

The v0.1.0 baseline was verified with:

- `npm run doctor`
- `npm run repo:check`
- `npm run release:check`
- `npm run verify`
- `npm run test`
- `npm run typecheck`

No real LLM smoke test execute mode was run for this release.
