import type { WorkflowContext } from "./types.ts";

export function createInitialContext(input: {
  taskId: string;
  userGoal: string;
  constraints?: Record<string, unknown>;
  successCriteria?: string[];
}): WorkflowContext {
  return {
    taskId: input.taskId,
    userGoal: input.userGoal,
    constraints: input.constraints ?? {},
    successCriteria: input.successCriteria ?? [],
    codingTaskContext: null,
    taskBrief: null,
    researchReport: null,
    feasibilityReport: null,
    plan: null,
    critique: null,
    revisedPlan: null,
    executionResult: null,
    codeExecutionResult: null,
    testExecutionResult: null,
    verification: null,
    scopedRepairPlan: null,
    humanApprovalRequest: null,
    correctionHint: null,
    iteration: 0,
    history: [],
    trace: [],
  };
}

export function readPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}
