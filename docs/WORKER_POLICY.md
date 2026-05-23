# Worker Policy

AgentFlow workers should use the configured workflow profile before choosing a workflow. The active profile defines the default workflow, scope gate, policy files, memory files, and blocked actions.

Workers must not ask the user to repeat standing constraints that are already present in `AGENTS.md`, `docs/AGENT_POLICY.md`, or the active profile. If the task does not fit the active profile, recommend a profile switch before planning or executing.

Workers must not bypass `WorkflowRuntime`, `WorkflowRunner`, `SchemaValidator`, scope confirmation, approval gates, patch verification, or policy audit records.
