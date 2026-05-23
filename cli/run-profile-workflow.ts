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
  console.log(`executedWorkflows: ${result.executedWorkflows.join(" -> ") || "none"}`);
  console.log(`summaryPaths: ${result.summaryPaths.join(" | ") || "none"}`);
  console.log(`tracePaths: ${result.tracePaths.join(" | ") || "none"}`);
  console.log(`warnings: ${result.warnings.join("; ") || "none"}`);
  if (result.autonomyDecision) {
    console.log(`autonomyDecision: ${result.autonomyDecision.decision}`);
    console.log(`autonomyCanProceed: ${result.autonomyDecision.canProceed}`);
    console.log(`autonomyReason: ${result.autonomyDecision.reason}`);
    console.log(`autonomyBlockedReasons: ${result.autonomyDecision.blockedReasons.join(" | ") || "none"}`);
  }
  if (result.session) {
    console.log(`sessionId: ${result.session.sessionId}`);
    console.log(`sessionStatus: ${result.session.status}`);
    if (result.session.scopeConfirmationId) console.log(`scopeConfirmationId: ${result.session.scopeConfirmationId}`);
    if (result.session.pendingQuestions.length > 0) console.log(`pendingQuestions: ${result.session.pendingQuestions.join(" | ")}`);
  }
  if (result.memorySummary) {
    console.log(`memoryRecords: ${result.memorySummary.records.length}`);
    console.log(`activeConfirmedScopes: ${result.memorySummary.activeConfirmedScopes.length}`);
    console.log(`memoryNextActions: ${result.memorySummary.nextActions.map((record) => record.summary).join(" | ") || "none"}`);
  }
  for (const step of result.steps) {
    console.log(`step: ${step.workflow}\t${step.status}\t${step.reason}`);
    if (step.runId) console.log(`  runId: ${step.runId}`);
    if (step.summaryPath) console.log(`  summaryPath: ${step.summaryPath}`);
    if (step.tracePath) console.log(`  tracePath: ${step.tracePath}`);
    if (typeof step.enteredExecutor === "boolean") console.log(`  enteredExecutor: ${step.enteredExecutor}`);
  }
  console.log("AgentFlow Role Timeline:");
  for (const event of result.roleTimeline) {
    console.log(`  [${event.status}] ${event.workflow} :: ${event.role}/${event.nodeId} -> ${event.nextNode ?? "n/a"}`);
    console.log(`    ${event.summary}`);
    if (event.summaryPath) console.log(`    summaryPath: ${event.summaryPath}`);
    if (event.tracePath) console.log(`    tracePath: ${event.tracePath}`);
  }
  console.log(`nextActions: ${result.nextActions.join(" | ")}`);
}
