# HITL Task Prompt Template

Use this when starting a substantial task with OMO/OpenCode.

```text
Use a judgment-centered human-in-the-loop workflow.

Goal:
<describe the concrete outcome>

Success criteria:
<how we will know it is done>

Scope:
<files, systems, or topics included>

Out of scope:
<what should not be touched>

Autonomous permissions:
- Read/search/analyze relevant files and docs.
- Draft plans, summaries, and implementation options.
- Run safe local verification.

Ask me before:
- Editing important files if the plan is ambiguous.
- Installing dependencies or using new external services.
- Writing outside this project.

Require explicit approval before:
- Sending, publishing, pushing, deploying, deleting, paying, or changing production data.

When you need input, ask with:
- Decision needed
- Options
- Recommendation
- Evidence
- Consequence

Prefer specialized agents:
- Explore/Librarian for read-only investigation.
- Metis for plan review.
- Momus for risk critique.
- Sisyphus/Atlas for execution.

Do not ask me to "review" generally. Ask only for concrete decisions.
```

