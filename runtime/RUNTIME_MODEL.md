# Agent Runtime Model

This document defines the runtime semantics for the OpenCode Supervisor Runtime.
It is intentionally schema-first: new features must fit these objects and state
transitions before they are implemented.

## Positioning

The runtime is not a roleplay multi-agent demo. It is an execution layer that
owns scheduling, state, evidence, verification, recovery, and observability for
long-running agent work.

OpenCode remains responsible for terminal interaction, model execution, tools,
streaming, and session storage. The Supervisor Runtime owns:

- task graph state
- node scheduling
- worker lifecycle
- evidence validation
- verification gates
- checkpoint and replay metadata
- execution trace
- approval checkpoints

## Runtime Objects

### Runtime

The top-level persisted object for a long-running run.

Required fields:

```ts
type Runtime = {
  runID: string
  sessionID: string
  workflowType: "research"
  status: RuntimeStatus
  goal: string
  runtimeGoal: RuntimeGoal
  taskGraph: TaskGraph
  workerSessions: Record<WorkerRole, WorkerSession>
  evidence: Evidence[]
  rejectedEvidence: Evidence[]
  verification?: VerificationResult
  checkpoints: Checkpoint[]
  executionTrace: RuntimeEvent[]
  replayRequest?: ReplayRequest
  summaryApproved: boolean
  iterationCount: number
  startedAt: string
  updatedAt: string
}
```

### RuntimeGoal

A Codex-style goal contract for the run. This is the human-readable and
machine-readable objective boundary used before building or executing the graph.

```ts
type RuntimeGoal = {
  id: string
  objective: string
  successCriteria: string[]
  constraints: string[]
  riskLevel: "low" | "medium" | "high"
  humanCheckpoints: string[]
  nonGoals: string[]
  createdAt: string
  updatedAt: string
}
```

Goal semantics:

- `objective` is the user's actual outcome, not an agent instruction.
- `successCriteria` defines how completion is judged.
- `constraints` define execution boundaries.
- `riskLevel` decides how conservative approval gates should be.
- `humanCheckpoints` are explicit judgment points.
- `nonGoals` prevent the runtime from expanding sideways.

Runtime statuses:

```text
idle
plan_approval
dispatching
waiting_agents
verifying
approval_required
synthesizing
complete
paused
failed
cancelled
```

Status semantics:

- `plan_approval`: graph exists, no execution is allowed yet.
- `dispatching`: execution was approved and scheduler may dispatch runnable nodes.
- `waiting_agents`: at least one worker or node is expected to produce output.
- `verifying`: evidence is being checked before human approval or summary.
- `approval_required`: runtime is blocked on a human decision.
- `synthesizing`: summary generation has started.
- `complete`: final output exists and no node is runnable.
- `paused`: scheduler must not dispatch new work.
- `failed`: scheduler cannot make progress without human repair.

### TaskGraph

A persisted DAG of executable work.

```ts
type TaskGraph = {
  version: number
  goal: string
  tasks: TaskNode[]
  updatedAt?: string
}
```

### TaskNode

A unit of schedulable work. A node is not a prompt. A node is an execution
contract with owner, dependencies, status, retry policy, and invalidation rules.

```ts
type TaskNode = {
  id: string
  title: string
  owner: WorkerRole | "Supervisor" | "EvidenceRuntime"
  depends_on: string[]
  status: NodeStatus
  attempts?: number
  maxAttempts?: number
  timeoutMs?: number
  createdAt?: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  blockedReason?: string
  rerunRequestedAt?: string
}
```

Node statuses:

```text
pending
running
blocked
retrying
completed
failed
cancelled
replayed
invalidated
```

Node semantics:

- `pending`: dependencies may or may not be satisfied; scheduler must decide.
- `running`: node has an assigned worker and an active execution.
- `blocked`: node cannot proceed until a human decision or dependency repair.
- `retrying`: node failed but retry policy allows another attempt.
- `completed`: node produced accepted output or state transition.
- `failed`: node exhausted retry/recovery.
- `cancelled`: node was explicitly stopped.
- `replayed`: node state was restored from checkpoint.
- `invalidated`: upstream evidence or verification changed, so the result cannot
  be trusted.

Runnable rule:

```text
node.status == pending
and every dependency.status in {completed, replayed}
and runtime.status not in {paused, approval_required, complete, failed}
```

### WorkerSession

A session-level isolation boundary for a runtime worker.

```ts
type WorkerSession = {
  sessionID: string
  role: WorkerRole
  isolation: "parent" | "session" | "logical_only"
  status: "ready" | "running" | "idle" | "failed" | "unavailable"
  parentSupervisorSessionID?: string
  createdAt?: string
  updatedAt: string
  error?: string
}
```

Worker roles:

```text
supervisor
research
critic
summary
```

Ownership rules:

- The Supervisor owns the runtime state and task graph.
- A worker owns only its execution context and local tool calls.
- Evidence produced in a worker session must be routed back to the parent
  Supervisor runtime before it can affect the graph.
- Workers must not directly mark the runtime complete.
- A worker result is only authoritative after validation or verification.

### Evidence

Evidence is not raw tool output. It is a validated runtime object.

```ts
type Evidence = {
  id?: string
  source: string
  worker: WorkerRole | string
  workerSessionID?: string
  task_id: string
  tool?: string
  callID?: string
  title?: string
  content: string
  contentHash: string
  confidence: number
  valid: boolean
  conflict: boolean
  validationReasons: string[]
  collectedAt: string
}
```

Evidence acceptance rules:

- Empty or too-short content is rejected.
- Unreadable compressed text is rejected.
- Missing source lowers confidence and may reject.
- Duplicate content is rejected.
- Content with obvious unresolved shorthand is rejected.
- Accepted evidence must have `valid = true` and confidence above threshold.

Evidence ownership:

- The producing worker owns the raw observation.
- The Evidence Runtime owns validation.
- The Supervisor owns accepted/rejected evidence lists.
- Summary can use only accepted evidence.

### VerificationResult

Verification is a gate between evidence collection and human approval.

```ts
type VerificationResult = {
  status: "running" | "passed" | "failed"
  mode: "heuristic" | "worker" | "heuristic_plus_worker"
  checkedAt: string
  validEvidence: number
  uniqueSources: number
  averageConfidence: number
  conflicts: string[]
  gaps: string[]
}
```

Verification failure propagation:

```text
verification.failed
-> invalidate dependent approval and summary nodes
-> clear summaryApproved
-> schedule research retry
-> checkpoint before retry
```

Verification success propagation:

```text
verification.passed
-> mark critic node completed
-> open approval gate
-> checkpoint before approval
```

### Checkpoint

A checkpoint is a replayable runtime snapshot. It is not the full session log.

```ts
type Checkpoint = {
  id: string
  label: string
  timestamp: string
  eventID?: string
  snapshot: RuntimeSnapshot
}
```

Checkpoint lifecycle:

- Created before human approval gates.
- Created after evidence accept/reject.
- Created before and after verification.
- Created before retry/replay/rerun.
- Retained in a bounded history.

Checkpoint invalidation:

A checkpoint becomes unsafe for automatic replay when:

- the task graph schema version changes incompatibly
- worker session IDs are unavailable
- accepted evidence has been invalidated
- the user changes the goal or constraints
- the checkpoint predates a destructive external action

Current replay mode:

```text
inspect_only
```

Future replay modes:

```text
inspect_only
restore_state
rerun_from_node
branch_from_checkpoint
```

### ReplayRequest

```ts
type ReplayRequest = {
  checkpointID: string
  requestedAt: string
  mode: "inspect_only" | "restore_state" | "rerun_from_node" | "branch_from_checkpoint"
  snapshot: RuntimeSnapshot
}
```

Replay semantics:

- Replay must not silently overwrite current state.
- Replay first loads snapshot in inspect mode.
- Automatic restore requires explicit human approval.
- Rerun must invalidate dependent nodes.
- Branch replay must create a new run ID.

### RuntimeEvent

Every meaningful transition emits an event. Events are append-only.

```ts
type RuntimeEvent = {
  id: string
  timestamp: string
  type: RuntimeEventType
  nodeID?: string
  worker?: string
  workerSessionID?: string
  source?: string
  confidence?: number
  status?: string
  reason?: string
  checkpointID?: string
}
```

Core event types:

```text
workflow.started
node.started
node.completed
node.failed
node.retry
node.rerun_requested
worker.created
worker.failed
evidence.accepted
evidence.rejected
verification.started
verification.passed
verification.failed
approval.required
approval.approved
approval.rejected
checkpoint.saved
replay.loaded
runtime.paused
runtime.resumed
runtime.failed
runtime.completed
```

Event bus semantics:

- The event stream is the source for dashboard and observability.
- Checkpoints reference events.
- Recovery decisions must emit events.
- Human approvals must emit events.
- Tool output is not an event until normalized by the runtime.

## Execution Engine Semantics

The scheduler should eventually operate as:

```text
scheduler.tick
-> load runtime
-> skip if paused, failed, complete, or approval_required
-> find runnable nodes
-> dispatch node to worker
-> record node.started
-> collect worker/tool result
-> validate output
-> checkpoint
-> update dependencies
-> repeat
```

The current implementation is still event-driven through OpenCode hooks, but
future work should converge on this explicit scheduler loop.

## Verification Loop

Target loop:

```text
research
-> evidence validation
-> critic verification
-> if failed: invalidate dependent nodes and retry research
-> if passed: approval gate
-> summary
```

The critic is an execution authority, not a writing role.

Critic can:

- mark verification failed
- identify gaps
- trigger research retry
- block approval
- invalidate dependent nodes

Critic cannot:

- write the final report
- mark the workflow complete
- override human approval

## Evidence Lineage

Every final claim should eventually link back to evidence:

```text
summary sentence
-> claim id
-> accepted evidence id
-> source
-> worker session
-> tool call
-> runtime event
```

Minimum lineage fields for future summary claims:

```ts
type Claim = {
  id: string
  text: string
  evidenceIDs: string[]
  confidence: number
  caveat?: string
}
```

Without lineage, replay and contradiction handling are not explainable.

## Human Approval Semantics

Human approval is required before:

- final summary generation
- replay restore
- branch replay
- accepting low-confidence evidence as support
- changing the research goal

Human approval is not required for:

- safe read-only research
- evidence rejection
- retrying a failed research node within retry policy
- dashboard/status inspection

## Design Rules

- Do not add new agent roles unless there is a new runtime ownership boundary.
- Do not add prompt complexity to solve state consistency problems.
- Tool output is never evidence by default.
- Worker output is never authoritative by default.
- Every node-level mutation must be traceable.
- Every recovery action must have a checkpoint.
- Summary must never consume rejected evidence as factual support.
- Ordinary chat/coding tasks must bypass the Supervisor Runtime.

## Current Implementation Status

Implemented:

- research-only runtime activation
- persisted task graph
- worker session registry
- ResearchWorker isolation attempt
- CriticWorker verification gate
- valid/rejected evidence
- confidence scoring
- execution trace
- checkpoints
- inspect-only replay
- node rerun request
- runtime event helpers in `runtime/events.js`
- node lifecycle helpers in `runtime/node_state.js`
- scheduler module in `runtime/scheduler.js`
- node timeout to retry/fail transition
- text dashboard

Not yet implemented:

- true state rollback replay
- branch replay
- dynamic graph generation
- node cancellation
- dependency invalidation beyond basic rerun
- claim-level evidence lineage
- real-time graphical dashboard
- durable event bus storage separate from session state

## Next Engineering Cut

The next implementation should not add features. It should continue extracting
runtime objects from ad hoc plugin state into a small schema module with
validators:

```text
runtime/schema.ts or runtime_schema.js
runtime/checkpoints.ts
runtime/recovery.ts
```

Only after schema validation exists should replay and recovery grow more
execution authority.
