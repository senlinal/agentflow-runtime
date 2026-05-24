# Task Fidelity

Multi-agent output is not useful when every role only says the workflow ran. The workflow must keep the user's original task visible and make the worker roles produce the requested deliverable.

## TaskBrief Fields

`TaskBrief.userRequest` stores the original user text. It is separate from `goal` so profile runners and role prompts can always inspect the exact request that should be answered.

`TaskBrief.expectedDeliverable` states the artifact the user should receive:

- `answer`
- `analysis_report`
- `code_change_plan`
- `patch`
- `experiment_plan`
- `workflow_demo`

`TaskBrief.successCriteria` is task-specific. A general answer task uses criteria such as directly answering the user, including concrete content, and avoiding workflow-only meta statements. It must not default to "Produce structured profile-aware workflow output."

## Deliverable-Centered Roles

Planner plans how to satisfy `userRequest` and `expectedDeliverable`, including `taskUnderstanding`, `proposedApproach`, `deliverablePlan`, and a mapping from success criteria to concrete work.

Debater critiques whether the plan can really satisfy the user request. It should flag vague plans, missing answer requirements, and plans that only describe the workflow.

Executor returns `ExecutionResult.deliverable`. For an answer task, `deliverable.content` must contain the actual answer. A sentence such as "I produced the answer" is not a deliverable.

Verifier checks:

- `deliverableExists`
- `answersUserRequest`
- `meetsSuccessCriteria`
- `isNotMetaOnly`
- `missingRequirements`

Meta-only content must fail even when the workflow shape is valid.

## Task-Solving Profile

`profiles/task-solving.json` runs `workflows/agent-workforce-task-solving.json`.

The workflow is:

Planner -> Debater -> PlannerRevision -> Executor -> Verifier -> end

It is for general task solving and does not use `CodeExecutor`. The default node behavior is mock and deterministic, so demos and tests do not call real LLM providers. A future explicit LLM-enabled path can use the same schemas, but real provider calls remain opt-in.

## Demo

```bash
npm run demo:task-solving-coffee
```

The demo runs:

```text
task: 解释一下咖啡的做法
profile: task-solving
expectedDeliverable.type: answer
```

The Executor produces concrete coffee-making instructions in `deliverable.content`, and the Role Timeline shows the deliverable type, content preview, and verifier fidelity flags.
