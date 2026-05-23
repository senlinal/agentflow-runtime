# Autonomy Policy

AgentFlow defaults to bounded autonomy.

Allowed without additional confirmation:

- Read project files and profile configuration.
- Run non-executing profile, template, scope, and validation commands.
- Produce summaries, traces, feasibility reports, and scope questions.

Requires explicit confirmation or a recorded approval:

- Applying code changes.
- Running approved CodeChangePlan execution.
- Touching external projects.
- Modifying production indexes or deploying.

Not allowed by default:

- Deleting files.
- Running destructive shell commands.
- Calling real LLM providers without explicit user request.
- Applying exported patches to a source project automatically.
