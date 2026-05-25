# Goal-driven Adaptive Execution

Goal Mode is the target-oriented execution layer for AgentFlow. It differs from Plan Mode: Plan Mode defines the goal, success criteria, candidate routes, stop conditions, and escalation conditions; Goal Mode executes bounded attempts and uses verifier feedback to decide whether to finish, retry, ask a human, or stop.

The loop must not run a fixed two-round demo. If the first attempt satisfies the verifier, the run ends immediately. If verification fails and the failure is repairable, the controller selects the next safe untried route. If the route is repeated, too costly, too risky, outside scope, unsafe, or the maximum attempt count is reached, the loop stops or asks a human.

## Decisions

- `success`: verifier passed; no more attempts are needed.
- `retry`: verifier failed with a repairable failure such as missing content, meta-only output, schema-invalid output, or an unknown but safe failure.
- `revise_plan`: reserved for future deeper plan changes when retrying the current candidate routes is insufficient.
- `ask_human`: the next route exceeds cost/risk budget, scope is unclear, or a human boundary is reached.
- `stop`: max attempts, repeated route, exhausted routes, or no-progress condition.

## Attempt Records

Each attempt is written under:

```text
.workflow-runs/<runId>/attempts/
  attempt-001.json
  attempt-002.json
  decisions.jsonl
```

Attempt records include route id, result summary, verifier result, failure reason, and the controller decision. Secrets are redacted before records are written.

## Memory And Gates

Memory and AutonomyGate still run before the workflow. Goal Mode can use memory summaries as context for planning, while the AdaptiveExecutionController acts like a local RouteGuard: it blocks repeated routes without new evidence and escalates high-risk or high-cost paths instead of pretending the workflow succeeded.
