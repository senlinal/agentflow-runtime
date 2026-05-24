import { ProfileWorkflowRunner } from "../core/profile/ProfileWorkflowRunner.ts";
import { parseArgs } from "./args.ts";

const args = parseArgs(process.argv.slice(2));
const result = await new ProfileWorkflowRunner().run({
  profileId: args.profile,
  task: args.task,
  inputPath: args.input,
  scopeConfirmationId: args.scopeConfirmationId,
  sessionId: args.sessionId,
  answer: args.answer,
  dryRun: args.dryRun === "true",
  allowExecution: args.allowExecution === "true",
});

if (args.format === "json") {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(result.formattedText);
}
