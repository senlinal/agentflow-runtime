# Changelog

All notable changes to this project will be documented in this file.

The format loosely follows Keep a Changelog, and this project uses pre-1.0 semantic versioning.

## 0.1.0 - Unreleased

### Added

- Configuration-driven `WorkflowRuntime`.
- `WorkflowRunner` for reusable template execution.
- `WorkflowTemplateRegistry`, `WorkflowTemplateValidator`, and `TemplateScaffolder`.
- Reusable role catalog under `roles/`.
- TaskBrief, ResearchReport, FeasibilityReport, Plan, Critique, RevisedPlan, ExecutionResult, VerificationReport, CorrectionHint, and SmokeTestResult schemas.
- `MockLLMClient` default execution.
- OpenAI-compatible LLM adapter.
- DeepSeek provider support with model policy warnings.
- Structured output parser, repairer, prompt renderer, and schema validation layer.
- LLM config reporting and dry-run smoke tests.
- opencode commands, custom tools, and policy plugin adapter.
- Policy audit log, approval store, replay integrity, replay runner, and replay timeline.
- GitHub release readiness docs and checks.

### Security

- API key redaction in provider errors and LLM security tests.
- Runtime and policy run directories ignored by Git.
- Release check for local absolute paths and obvious secrets.

### Notes

- Default workflows and tests do not call external LLM providers.
- No Coding Executor is included.
- No UI is included.
