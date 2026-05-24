# /workflow-profile

Inspect or switch the active workflow profile used by `/workflow`.

## Usage

```text
/workflow-profile
/workflow-profile use rag-optimization
/workflow-profile inspect rag-optimization
/workflow-profile inspect frontend-site-build
```

If direct command arguments are not available, run the matching npm commands:

```bash
npm run workflow:profile
npm run workflow:profiles
npm run workflow:profile:inspect -- --profile rag-optimization
npm run workflow:profile:use -- --profile rag-optimization
```

## Instructions

1. Show `profiles/current.json` and the active profile.
2. List available profiles:
   - `rag-optimization`
   - `coding-safe-fix`
   - `external-project-fix`
   - `frontend-site-build`
3. Explain that `/workflow` uses the active profile automatically.
4. If switching profile, call the local command `npm run workflow:profile:use -- --profile <id>`.
5. Do not run execution workflows while showing or switching profiles.
