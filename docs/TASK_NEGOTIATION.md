# Task Negotiation

Task negotiation is the first step for broad or ambiguous work. It turns a raw user request into a `TaskNegotiationResult` containing task type, target module, complexity, ambiguities, clarification questions, proposed scope, and recommended next step.

`TaskNegotiationResult` is advisory only. It does not grant permission to plan, execute, modify files, or run tests.

For RAG optimization, negotiation should identify metric definitions, evaluation data, whether chunk/index/reranker/query-rewrite changes are in scope, and whether production changes are allowed.
