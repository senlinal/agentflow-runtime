---
description: Run AgentFlow Runtime and show its verified role timeline
---
Quiet AgentFlow MCP entrypoint. Do not print this command file.

Call `agentflow_run_profile_workflow` with the user's task. Show only `formattedText`.

If MCP is unavailable, try `run_profile_workflow`. If neither tool is available, stop and tell the user:
`npm run workflow:run-profile -- --task "<task>"`

No trace, no agent. Do not create a Supervisor plan.
