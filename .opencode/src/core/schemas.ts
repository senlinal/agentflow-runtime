import { z } from "zod";

export const TaskSpecSchema = z.object({
  taskId: z.string(),
  userGoal: z.string().min(1),
  constraints: z.record(z.string(), z.unknown()).default({}),
  successCriteria: z.array(z.string()).default([]),
});

export const PlanStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  objective: z.string(),
  inputs: z.array(z.string()).default([]),
  expectedOutput: z.string(),
});

export const PlanSchema = z.object({
  summary: z.string(),
  steps: z.array(PlanStepSchema).min(1),
  successAlignment: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
});

export const CritiqueSchema = z.object({
  issues: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  unclearItems: z.array(z.string()).default([]),
  recommendedChanges: z.array(z.string()).default([]),
});

export const RevisedPlanSchema = PlanSchema.extend({
  revisionNotes: z.array(z.string()).default([]),
  addressedCritique: z.array(z.string()).default([]),
  appliedCorrectionHint: z.boolean().default(false),
});

export const ExecutionResultSchema = z.object({
  status: z.enum(["completed", "partial", "failed"]),
  artifacts: z.array(z.object({
    name: z.string(),
    type: z.string(),
    content: z.string(),
  })).default([]),
  summary: z.string(),
  evidence: z.array(z.string()).default([]),
  errors: z.array(z.string()).default([]),
});

export const VerificationReportSchema = z.object({
  pass: z.boolean(),
  score: z.number().min(0).max(1),
  failedCriteria: z.array(z.string()).default([]),
  reason: z.string(),
  nextAction: z.enum(["end", "replan", "revise", "retry"]),
  feedbackToPlanner: z.string(),
});

export const CorrectionHintSchema = z.object({
  originalGoal: z.string(),
  failureReason: z.string(),
  correctionHint: z.string(),
  mustPreserve: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  nextPlannerFocus: z.array(z.string()).default([]),
});

export const WorkflowTraceSchema = z.object({
  step: z.number().int().nonnegative(),
  nodeId: z.string(),
  role: z.string(),
  inputKeys: z.array(z.string()),
  outputKey: z.string(),
  outputSummary: z.string(),
  nextNode: z.string().nullable(),
  conditionResult: z.string().nullable(),
  timestamp: z.string(),
  error: z.string().optional(),
});

export const WorkflowContextSchema = TaskSpecSchema.extend({
  plan: PlanSchema.nullable().default(null),
  critique: CritiqueSchema.nullable().default(null),
  revisedPlan: RevisedPlanSchema.nullable().default(null),
  executionResult: ExecutionResultSchema.nullable().default(null),
  verification: VerificationReportSchema.nullable().default(null),
  correctionHint: CorrectionHintSchema.nullable().default(null),
  iteration: z.number().int().nonnegative().default(0),
  history: z.array(z.unknown()).default([]),
  trace: z.array(WorkflowTraceSchema).default([]),
  stopReason: z.string().optional(),
});

export const OutputSchemas = {
  TaskSpec: TaskSpecSchema,
  Plan: PlanSchema,
  Critique: CritiqueSchema,
  RevisedPlan: RevisedPlanSchema,
  ExecutionResult: ExecutionResultSchema,
  VerificationReport: VerificationReportSchema,
  CorrectionHint: CorrectionHintSchema,
  WorkflowTrace: WorkflowTraceSchema,
};

export type TaskSpec = z.infer<typeof TaskSpecSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Critique = z.infer<typeof CritiqueSchema>;
export type RevisedPlan = z.infer<typeof RevisedPlanSchema>;
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;
export type VerificationReport = z.infer<typeof VerificationReportSchema>;
export type CorrectionHint = z.infer<typeof CorrectionHintSchema>;
export type WorkflowTrace = z.infer<typeof WorkflowTraceSchema>;
export type WorkflowContext = z.infer<typeof WorkflowContextSchema>;
export type OutputSchemaName = keyof typeof OutputSchemas;
