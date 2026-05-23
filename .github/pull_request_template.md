## Summary

- 

## Changes

- 

## Verification

Run the relevant checks:

```bash
npm run release:check
npm run doctor
npm run test
npm run typecheck
```

## Safety Checklist

- [ ] No `.env` or secrets committed.
- [ ] No `.workflow-runs/` or `.opencode/policy-runs/` committed.
- [ ] Runtime flow remains configuration-driven.
- [ ] New schemas have tests.
- [ ] New conditions have tests.
- [ ] Real LLM calls are not required for tests.
- [ ] opencode adapter does not bypass `WorkflowRunner`.
