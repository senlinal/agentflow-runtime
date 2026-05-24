import { loadDotenv } from "../core/EnvLoader.ts";
import { ProfileWorkflowRunner } from "../core/profile/ProfileWorkflowRunner.ts";
import { parseArgs } from "./args.ts";

loadDotenv();

const args = parseArgs(process.argv.slice(2));
const result = await runQuietly(() =>
  new ProfileWorkflowRunner().run({
    profileId: args.profile,
    task: args.task,
    inputPath: args.input,
    scopeConfirmationId: args.scopeConfirmationId,
    sessionId: args.sessionId,
    answer: args.answer,
    dryRun: args.dryRun === "true",
    allowExecution: args.allowExecution === "true",
  })
);

if (args.format === "json") {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(result.formattedText);
}

async function runQuietly<T>(callback: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const captured: string[] = [];
  console.log = (...items: unknown[]) => captured.push(items.map(String).join(" "));
  console.warn = (...items: unknown[]) => captured.push(items.map(String).join(" "));
  try {
    return await callback();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    if (process.env.AGENTFLOW_DEBUG_PROFILE_RUNNER === "1" && captured.length > 0) {
      console.error(captured.join("\n"));
    }
  }
}
