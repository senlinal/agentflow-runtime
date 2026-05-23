# RAG Optimization Memory

Default RAG optimization memory rules:

- Confirm recall metric definitions before feasibility or planning.
- Do not trade answer quality for retrieval recall without explicit human confirmation.
- Do not modify production indexes or deploy changes from a profile run.
- Record whether chunk changes, index rebuilds, reranker changes, and query rewrite are allowed.
- Record tried experiment routes and rejected routes so later workflow runs do not repeat the same dead ends.

Runtime memory records are written to `.agentflow/project-memory/`, not to this file.
