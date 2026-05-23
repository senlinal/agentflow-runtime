import { createInitialContext } from "./core/context.ts";
import { NodeRegistry } from "./core/NodeRegistry.ts";
import { ScopeConfirmationService } from "./core/scope/ScopeConfirmationService.ts";
import { ScopeConfirmationStore } from "./core/scope/ScopeConfirmationStore.ts";
import { TaskBriefLoader } from "./core/TaskBriefLoader.ts";
import { TraceStore } from "./core/TraceStore.ts";
import { WorkflowGraph } from "./core/WorkflowGraph.ts";
import { WorkflowRuntime } from "./core/WorkflowRuntime.ts";
import { WorkflowTemplateRegistry } from "./core/WorkflowTemplateRegistry.ts";
import { negotiateTask } from "./core/negotiation/TaskNegotiatorExecutor.ts";

async function main(): Promise<void> {
  const taskBrief = await TaskBriefLoader.loadJson("inputs/task-negotiation-rag-task.json");
  const negotiation = negotiateTask(taskBrief);
  const service = new ScopeConfirmationService();
  const record = service.createRecord({
    negotiation,
    confirmedBy: "demo-user",
    confirmedScope: {
      metricDefinition: {
        primaryMetric: "answer relevance on a fixed evaluation set",
        secondaryMetrics: ["citation coverage", "no answer quality regression"],
        targetValue: "improve relevance without reducing citation coverage",
        evaluationDataset: "user-provided RAG evaluation examples",
      },
      ragConstraints: {
        recallLevel: "chunk",
        allowChunkChanges: true,
        allowIndexRebuild: false,
        allowRerankerChanges: false,
        allowQueryRewrite: true,
        allowAnswerQualityRegression: false,
        productionChangesAllowed: false,
      },
      allowedActions: ["inspect_project", "evaluate_feasibility"],
    },
    userAnswers: negotiation.clarificationQuestions.map((question) => ({
      question,
      answer: "Use a small offline evaluation set and do not change production indexes.",
    })),
  });
  const saved = await new ScopeConfirmationStore().save(record);
  const { config } = await new WorkflowTemplateRegistry().load("confirmed-scope-gate");
  const graph = new WorkflowGraph(config);
  const context = {
    ...createInitialContext({
      taskId: taskBrief.taskId,
      userGoal: taskBrief.goal,
      constraints: { taskBriefConstraints: taskBrief.constraints },
      successCriteria: taskBrief.successCriteria,
    }),
    taskBrief,
    taskNegotiationResult: negotiation,
    scopeConfirmationRecord: record,
  };
  const finalContext = await new WorkflowRuntime(graph, NodeRegistry.withDefaults()).run(context);
  const traceStore = await TraceStore.save(finalContext, {
    workflowName: graph.name,
    templateVersion: config.workflow.version,
  });

  console.log("Demo: scope-confirmation");
  console.log(`workflow=${config.workflow.name}`);
  console.log(`confirmationId=${record.confirmationId}`);
  console.log(`confirmationStatus=${record.status}`);
  console.log(`gateAllowed=${finalContext.confirmedScopeGateResult?.allowed ?? false}`);
  console.log(`recommendedNextStep=${finalContext.confirmedScopeGateResult?.recommendedNextStep ?? "n/a"}`);
  console.log(`recordPath=${saved.recordPath}`);
  console.log("codeExecutorCalled=false");
  console.log("testsRun=false");
  console.log(`summaryPath=${traceStore.summaryPath}`);
  console.log(`tracePath=${traceStore.tracePath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
