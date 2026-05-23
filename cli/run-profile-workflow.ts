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
  console.log(`profile: ${result.profileId}`);
  console.log(`profileName: ${result.profileName}`);
  console.log(`finalStatus: ${result.finalStatus}`);
  console.log(`dryRun: ${result.dryRun}`);
  console.log(`allowExecution: ${result.allowExecution}`);
  console.log(`workflowChain: ${result.workflowChain.join(" -> ")}`);
  console.log(`warnings: ${result.warnings.join("; ") || "none"}`);
  if (result.session) {
    console.log(`sessionId: ${result.session.sessionId}`);
    console.log(`sessionStatus: ${result.session.status}`);
    if (result.session.scopeConfirmationId) console.log(`scopeConfirmationId: ${result.session.scopeConfirmationId}`);
    if (result.session.pendingQuestions.length > 0) console.log(`pendingQuestions: ${result.session.pendingQuestions.join(" | ")}`);
  }
  for (const step of result.steps) {
    console.log(`step: ${step.workflow}\t${step.status}\t${step.reason}`);
    if (step.runId) console.log(`  runId: ${step.runId}`);
    if (step.summaryPath) console.log(`  summaryPath: ${step.summaryPath}`);
    if (step.tracePath) console.log(`  tracePath: ${step.tracePath}`);
    if (typeof step.enteredExecutor === "boolean") console.log(`  enteredExecutor: ${step.enteredExecutor}`);
  }
  console.log(`nextActions: ${result.nextActions.join(" | ")}`);
}
