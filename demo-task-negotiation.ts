import { WorkflowRunner } from "./core/WorkflowRunner.ts";
import { TaskBriefLoader } from "./core/TaskBriefLoader.ts";
import { WorkflowTemplateRegistry } from "./core/WorkflowTemplateRegistry.ts";

async function main(): Promise<void> {
  const registry = new WorkflowTemplateRegistry();
  const template = await registry.load("task-negotiation");
  const taskBrief = await TaskBriefLoader.loadJson("inputs/task-negotiation-rag-task.json");
  const result = await new WorkflowRunner().run(template.config, taskBrief);
  const negotiation = result.context.taskNegotiationResult;

  console.log("Demo: task-negotiation");
  console.log(`workflow=${template.config.workflow.name}`);
  console.log(`detectedTaskType=${negotiation?.detectedTaskType ?? "n/a"}`);
  console.log(`targetModule=${negotiation?.targetModule ?? "n/a"}`);
  console.log(`complexity=${negotiation?.complexity ?? "n/a"}`);
  console.log(`recommendedNextStep=${negotiation?.recommendedNextStep ?? "n/a"}`);
  console.log(`readyToExecute=${negotiation?.readyToExecute ?? "n/a"}`);
  console.log(`clarificationQuestions=${JSON.stringify(negotiation?.clarificationQuestions ?? [])}`);
  console.log(`blockedActions=${JSON.stringify(negotiation?.proposedScope.blockedActions ?? [])}`);
  console.log("codeExecutorCalled=false");
  console.log(`summaryPath=${result.summaryPath}`);
  console.log(`tracePath=${result.tracePath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
