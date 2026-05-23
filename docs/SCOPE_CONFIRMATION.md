# Scope Confirmation

Scope confirmation records the human-confirmed task boundary after negotiation.

`ScopeConfirmationRecord` is the durable structure that later workflows can use as a gate. It contains the confirmed goal, allowed and forbidden modules, allowed and blocked actions, accepted assumptions, rejected assumptions, and quality constraints.

For RAG work, a confirmed scope must include metric definition and RAG constraints, including recall level and whether chunk, index, reranker, query rewrite, answer-quality regression, or production changes are allowed.

`ConfirmedScopeGate` validates the record. It does not execute code, run tests, call CodeExecutor, or call a real LLM.

In the `rag-optimization` workflow profile, `confirmed-scope-gate` is the scope gate between negotiation and feasibility. The profile expects RAG scope confirmation to include metric definition and RAG constraints before downstream feasibility or planning is considered.
