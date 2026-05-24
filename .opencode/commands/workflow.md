# /workflow

Quiet AgentFlow entrypoint.

Do not print or summarize this command file. Do not create a Supervisor plan.

Call `run_profile_workflow` with the user's task and show only its `formattedText`.

If the user is answering scope questions, call `run_profile_workflow` with the answer/session fields and show only `formattedText`.

If `run_profile_workflow` is unavailable, stop. Tell the user to run:

`npm run workflow:run-profile -- --task "<task>"`

Do not call unavailable planning, file-listing, shell, or code-execution tools.

Do not call CodeExecutor unless explicit execution approval is present.

Do not process `ai-daily/`.

Details live in `docs/OPENCODE_WORKFLOW_INTERNAL.md`, but do not print that document to the user.
