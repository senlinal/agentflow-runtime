import { loadDotenv } from "../core/EnvLoader.ts";
import { parseArgs } from "./args.ts";
import { LLMConfigLoader } from "../core/LLMConfigLoader.ts";
import { LLMConfigReporter } from "../core/LLMConfigReporter.ts";
import { redactSecrets } from "../core/SecretRedactor.ts";

loadDotenv();

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const format = args.format === "json" ? "json" : "text";
  const env = envWithOverrides(args);
  const config = LLMConfigLoader.fromEnv(env);
  const summary = LLMConfigReporter.summarize(config);

  if (format === "json") {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(LLMConfigReporter.formatText(summary));
}

function envWithOverrides(args: Record<string, string>): Record<string, string | undefined> {
  const env = { ...process.env };
  if (args.provider) env.AGENTFLOW_LLM_PROVIDER = args.provider;
  if (args.model) {
    if ((args.provider ?? env.AGENTFLOW_LLM_PROVIDER) === "deepseek") {
      env.AGENTFLOW_DEEPSEEK_MODEL = args.model;
    } else {
      env.AGENTFLOW_LLM_MODEL = args.model;
    }
  }
  return env;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redactSecrets(message));
  process.exitCode = 1;
});
