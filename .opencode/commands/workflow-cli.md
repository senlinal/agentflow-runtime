# /workflow-cli

CLI fallback for AgentFlow profile runs when opencode has not loaded `run_profile_workflow`.

Do not call unavailable tools. Do not create a Supervisor Research Plan.

Tell the user to run this in the project terminal:

```bash
npm run workflow:run-profile -- --task "<user task>"
```

For scope-answer resume:

```bash
npm run workflow:run-profile -- --sessionId "<sessionId>" --answer "<user answer>"
```

The CLI output contains `AgentFlow Profile Run`, `Routing Decision`, `AgentFlow Role Timeline`, artifact paths, and next actions.
