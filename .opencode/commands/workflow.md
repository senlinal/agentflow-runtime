---
description: Run AgentFlow runtime workflow with verified role timeline
---
User command: /workflow $ARGUMENTS
!`AGENTFLOW_PROJECT_ROOT="${AGENTFLOW_PROJECT_ROOT:-$PWD}" node --experimental-strip-types "${AGENTFLOW_PROJECT_ROOT:-$PWD}/cli/opencode-workflow-command.ts" --compact $ARGUMENTS`
Display the AgentFlow runtime result above, then dispatch OpenCode Task subagents only for timeline roles whose `source` is `runtime_trace` or `subagent_dispatch_trace`; `isMock: true` remains simulation, not real model-backed execution.
