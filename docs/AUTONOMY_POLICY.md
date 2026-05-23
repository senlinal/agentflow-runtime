# Autonomy Policy

AgentFlow defaults to bounded autonomy.

Allowed without additional confirmation:

- Read project files and profile configuration.
- Run non-executing profile, template, scope, and validation commands.
- Produce summaries, traces, feasibility reports, and scope questions.
- Continue low-risk profile preflight when compacted memory has no blocking conflict, rejected-route repeat, or blocking open question.

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

## Memory-Aware Autonomy Gate

Profile-aware runs use compacted project memory to decide whether the agent can continue without asking the human.

The gate returns an `AutonomyDecision`:

- `proceed`: compacted memory has no blockers for the proposed action.
- `proceed_with_assumptions`: the action is low risk, but assumptions or non-blocking questions remain.
- `ask_human`: high-severity memory conflicts, blocking open questions, or confirmed scope boundaries require a human decision.
- `blocked`: the proposed action repeats a rejected route marked `doNotRepeatWithoutNewEvidence`.
- `stop`: reserved for future hard stop conditions.

High-severity memory conflicts must not be treated as warnings only. Blocking open questions must be asked before continuing. Rejected routes marked do-not-repeat must not be retried unless new evidence is recorded.

`EscalationGate` converts the `AutonomyDecision` into the runner-level block/escalation behavior. It does not execute anything; it only decides whether the profile chain may continue or must stop for human input.

Use:

```bash
npm run memory:autonomy -- --profile rag-optimization --task "continue RAG optimization"
```

This command is read-only. It does not call an LLM, execute workflows, modify files, or run tests.
