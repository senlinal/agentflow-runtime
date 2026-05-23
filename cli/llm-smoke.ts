import { parseArgs } from "./args.ts";
import { LLMSmokeTester, type LLMSmokeTestReport } from "../core/LLMSmokeTester.ts";
import { redactSecrets } from "../core/SecretRedactor.ts";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const format = args.format === "json" ? "json" : "text";
  const execute = args.execute === "true";
  const report = await new LLMSmokeTester().run({
    execute,
    env: envWithOverrides(args),
  });

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(formatText(report));
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

function formatText(report: LLMSmokeTestReport): string {
  return [
    `mode: ${report.mode}`,
    `provider: ${report.provider}`,
    `model: ${report.model ?? "n/a"}`,
    `baseURL: ${report.baseURL ?? "n/a"}`,
    `hasApiKey: ${report.hasApiKey}`,
    `warnings: ${report.warnings.length > 0 ? report.warnings.join("; ") : "none"}`,
    `wouldExecute: ${report.wouldExecute}`,
    `success: ${report.success}`,
    `attempts: ${report.attempts}`,
    `message: ${report.message}`,
  ].join("\n");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redactSecrets(message));
  process.exitCode = 1;
});
