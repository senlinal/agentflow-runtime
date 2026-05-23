# LLM Adapter

The core runtime still defaults to `MockLLMClient`. Real model calls are opt-in and are enabled only when a workflow node is explicitly configured with `type: "llm"`.

```json
{
  "id": "planner",
  "type": "llm",
  "role": "Planner",
  "description": "Create a structured plan.",
  "inputKeys": ["taskBrief"],
  "outputKey": "plan",
  "outputSchema": "Plan",
  "retryPolicy": {
    "maxAttempts": 2,
    "backoffMs": 100
  }
}
```

`WorkflowRuntime` does not know provider details. It asks `NodeRegistry` for a `NodeExecutor`; `LLMExecutor` calls an `LLMClient`; schema validation happens before output is written into context.

## Environment

The real adapter layer uses OpenAI-compatible chat completions and `fetch` without adding a dependency.

```bash
AGENTFLOW_LLM_PROVIDER=openai-compatible
AGENTFLOW_LLM_API_KEY=...
AGENTFLOW_LLM_BASE_URL=https://api.openai.com/v1
AGENTFLOW_LLM_MODEL=gpt-4.1-mini
AGENTFLOW_LLM_TIMEOUT_MS=60000
AGENTFLOW_LLM_MAX_RETRIES=2
```

Fallback aliases are also supported:

```bash
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
```

`LLMConfigLoader` reads this environment. The default provider is `mock`. For `openai-compatible`, `AGENTFLOW_LLM_API_KEY`, `AGENTFLOW_LLM_BASE_URL`, and `AGENTFLOW_LLM_MODEL` are required.

DeepSeek is a first-class provider that reuses `OpenAICompatibleLLMClient`:

```bash
AGENTFLOW_LLM_PROVIDER=deepseek
AGENTFLOW_DEEPSEEK_API_KEY=...
AGENTFLOW_DEEPSEEK_MODEL=deepseek-v4-flash
```

DeepSeek defaults to `https://api.deepseek.com`. Override it only when needed:

```bash
AGENTFLOW_DEEPSEEK_BASE_URL=https://api.deepseek.com
```

`DEEPSEEK_API_KEY` is also supported. `AGENTFLOW_DEEPSEEK_API_KEY` takes precedence.

DeepSeek model policy:

- `deepseek-v4-flash`: default low-cost model, reasoning disabled by default.
- `deepseek-v4-pro`: recommended for higher quality or reasoning-heavy tasks; reasoning can be enabled with env vars.
- `deepseek-chat`: allowed legacy model; emits a warning.
- `deepseek-reasoner`: allowed legacy model; emits a warning and enables reasoning by default.
- unknown DeepSeek model names are allowed but warn so the user can confirm the model name.

Reasoning controls:

```bash
AGENTFLOW_DEEPSEEK_REASONING_ENABLED=true
AGENTFLOW_DEEPSEEK_REASONING_EFFORT=high
```

DeepSeek requests still use `response_format: { "type": "json_object" }`. If a response contains `reasoning_content`, only assistant `content` is parsed and returned as `rawText`; reasoning text is not persisted by the adapter.

Do not commit `.env`. API keys, tokens, and provider error bodies are sanitized before being included in thrown errors.

## Running an LLM Workflow

`workflows/abcde-basic.llm.json` is an opt-in template named `abcde-basic-llm`. It is not used by default demos.

```bash
AGENTFLOW_LLM_PROVIDER=openai-compatible \
AGENTFLOW_LLM_BASE_URL=https://api.openai.com/v1 \
AGENTFLOW_LLM_API_KEY=replace-with-your-api-key \
AGENTFLOW_LLM_MODEL=gpt-4.1-mini \
npm run workflow -- --template abcde-basic-llm --input inputs/feasible-task.json
```

## Config Check And Smoke Test

Inspect the active provider configuration without calling a model:

```bash
npm run llm:config
npm run llm:config -- --provider deepseek
npm run llm:config -- --provider deepseek --format json
```

The output is sanitized. It shows provider, model, base URL, timeout, retry count, warnings, and whether an API key is configured as `true` or `false`; it never prints the key.

Run a dry-run smoke test without network access:

```bash
npm run llm:smoke
npm run llm:smoke -- --provider deepseek
```

Dry-run validates config loading and prompt/schema construction only. It reports `wouldExecute: false` and tells you to pass `--execute` for a real provider call.

Only this explicit command calls a real provider:

```bash
AGENTFLOW_LLM_PROVIDER=deepseek \
AGENTFLOW_DEEPSEEK_API_KEY=replace-with-your-deepseek-api-key \
AGENTFLOW_DEEPSEEK_MODEL=deepseek-v4-flash \
npm run llm:smoke -- --provider deepseek --execute
```

`npm run test` never runs execute-mode smoke tests. Execute mode sends one minimal structured-output request and validates `SmokeTestResult` through the same parser and `SchemaValidator` path used by workflow nodes.

LLM config warnings, such as DeepSeek legacy model warnings, are surfaced in workflow `summary.md` when a template contains `type: "llm"` nodes. Runtime metadata stores only sanitized provider/model/attempt/schema information. API keys, authorization headers, full sensitive prompts, and `reasoning_content` are not persisted.

DeepSeek example:

```bash
AGENTFLOW_LLM_PROVIDER=deepseek \
AGENTFLOW_DEEPSEEK_API_KEY=replace-with-your-deepseek-api-key \
AGENTFLOW_DEEPSEEK_MODEL=deepseek-v4-flash \
npm run workflow -- --template abcde-basic-llm --input inputs/feasible-task.json
```

## Structured Output Stability

The adapter requests JSON output and then applies a local stability layer:

- `StructuredOutputParser` accepts plain JSON, fenced JSON, or a JSON object embedded in surrounding text.
- `PromptRenderer` loads role prompts from `prompts/roles/<role>.md` and adds schema guidance.
- `SchemaValidator` validates the parsed object against the configured `outputSchema`.
- `StructuredOutputRepairer` builds a repair prompt for invalid JSON or invalid schema output.
- invalid JSON or invalid schema output triggers retry / repair when `retryPolicy.maxAttempts > 1`.
- if all attempts fail, the node fails and the runtime records an error trace without writing invalid output to context.

## Troubleshooting

- Validate the template first: `npm run workflow:validate -- --template abcde-basic-llm`.
- Inspect node types and schemas: `npm run workflow:inspect -- --template abcde-basic-llm`.
- Check config without network: `npm run llm:config -- --provider deepseek`.
- Dry-run the smoke test before any real call: `npm run llm:smoke -- --provider deepseek`.
- Missing key, wrong base URL, wrong model name, non-JSON output, schema mismatch, and timeout failures are reported as explicit errors.
- If the provider returns prose or Markdown, increase node `retryPolicy.maxAttempts` and inspect the node error trace.
- If schema validation fails, check whether the model returned missing fields, invalid enum values, or arrays where strings were required.
- If credentials are missing, `LLMConfigLoader` will fail before provider calls. The error must not print the API key.

## Testing

Tests use fake `fetch` responses and never call external APIs. Existing demo workflows continue to use `type: "mock"`.

## Current Limits

- Real providers currently supported: `openai-compatible` and `deepseek`.
- DeepSeek uses the OpenAI-compatible adapter under the hood.
- There is no Coding Executor.
- There is no UI.
- Real model output can still be inconsistent; schema validation remains the final gate before context writes.
