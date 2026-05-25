import type { AgentNode, GoalExecutionPlan, NodeExecutor, TaskBrief, WorkflowContext } from "../types.ts";

export class GoalPlanner implements NodeExecutor {
  async execute(_node: AgentNode, context: WorkflowContext): Promise<GoalExecutionPlan> {
    const plan = this.plan({
      taskBrief: context.taskBrief,
      memorySummary: context.constraints?.memorySummary,
    });
    context.adaptiveState = {
      goalPlan: plan,
      attempts: context.adaptiveState?.attempts ?? [],
      decisions: context.adaptiveState?.decisions ?? [],
      currentAttemptNumber: context.adaptiveState?.currentAttemptNumber ?? 0,
      currentRouteId: context.adaptiveState?.currentRouteId,
      status: "planning",
    };
    return plan;
  }

  plan(input: { taskBrief?: TaskBrief | null; memorySummary?: unknown }): GoalExecutionPlan {
    const brief = input.taskBrief;
    const goal = brief?.userRequest ?? brief?.goal ?? "Complete the requested task.";
    const taskType = brief?.taskType ?? "unknown";
    const successCriteria = unique([
      ...(brief?.successCriteria ?? []),
      ...(taskType === "rag_optimization"
        ? ["Improve or diagnose recall quality.", "Preserve answer quality.", "Do not change production retrieval state without confirmation."]
        : []),
      ...(brief?.expectedDeliverable?.type === "answer" || taskType === "general_answer"
        ? ["Deliverable content directly answers the user request.", "Deliverable is not workflow-only or meta-only."]
        : ["Deliverable is concrete and usable for the user's goal."]),
    ]);

    return {
      planId: `goal_plan_${stableId(goal)}`,
      goal,
      successCriteria,
      candidateRoutes: taskType === "rag_optimization" ? ragRoutes() : defaultRoutes(brief),
      stopConditions: [
        "Verifier passes all success criteria.",
        "Maximum attempts are reached without new progress.",
        "All safe candidate routes are exhausted.",
        "A repeated route would be retried without new evidence.",
      ],
      escalationConditions: [
        "The task is out of confirmed scope.",
        "The next route would exceed cost or risk budget.",
        "The goal or required output is ambiguous enough to change the deliverable.",
        "A destructive or production action would be required.",
      ],
      maxAttempts: taskType === "rag_optimization" ? 4 : 3,
      costBudget: "medium",
      riskBudget: "medium",
      createdAt: new Date().toISOString(),
    };
  }
}

function defaultRoutes(brief: TaskBrief | null | undefined): GoalExecutionPlan["candidateRoutes"] {
  const deliverable = brief?.expectedDeliverable?.type ?? "answer";
  return [
    {
      routeId: "direct_deliverable",
      summary: `Produce the ${deliverable} directly against the user's request.`,
      expectedOutcome: "A concrete deliverable that can pass verifier fidelity checks in one attempt.",
      costLevel: "low",
      riskLevel: "low",
      repairableFailureCodes: ["missing_content", "meta_only_output", "unknown"],
    },
    {
      routeId: "add_missing_content",
      summary: "Add missing user-facing content identified by the verifier.",
      expectedOutcome: "A revised deliverable with missing requirements filled in.",
      costLevel: "low",
      riskLevel: "low",
      repairableFailureCodes: ["missing_content", "meta_only_output"],
    },
    {
      routeId: "retry_with_more_detail",
      summary: "Retry with more explicit success-criteria coverage.",
      expectedOutcome: "A more detailed deliverable with success criteria mapped into content.",
      costLevel: "medium",
      riskLevel: "low",
      repairableFailureCodes: ["unknown", "schema_invalid"],
    },
  ];
}

function ragRoutes(): GoalExecutionPlan["candidateRoutes"] {
  return [
    {
      routeId: "diagnose_recall",
      summary: "Diagnose retrieval and recall quality before proposing changes.",
      expectedOutcome: "Recall issue hypotheses and safe measurements.",
      costLevel: "medium",
      riskLevel: "low",
      repairableFailureCodes: ["missing_content", "unknown"],
    },
    {
      routeId: "answer_quality_review",
      summary: "Check whether answer quality constraints are preserved.",
      expectedOutcome: "Answer-quality risks and safeguards.",
      costLevel: "medium",
      riskLevel: "low",
      repairableFailureCodes: ["missing_content", "meta_only_output"],
    },
    {
      routeId: "ask_for_scope_confirmation",
      summary: "Ask for human confirmation before risky retrieval changes.",
      expectedOutcome: "Explicit scope or metric confirmation.",
      costLevel: "low",
      riskLevel: "medium",
      repairableFailureCodes: ["scope_mismatch", "high_cost", "unsafe_action"],
    },
  ];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function stableId(value: string): string {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash.toString(16);
}
