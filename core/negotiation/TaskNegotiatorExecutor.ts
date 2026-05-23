import { createHash } from "node:crypto";
import type {
  AgentNode,
  NodeExecutor,
  TaskBrief,
  TaskNegotiationResult,
  WorkflowContext,
} from "../types.ts";

const SENSITIVE_DEFAULTS = [".env", "*.key", "*.pem", "*token*", "*credential*", "*secret*"];

export class TaskNegotiatorExecutor implements NodeExecutor {
  async execute(_node: AgentNode, context: WorkflowContext): Promise<TaskNegotiationResult> {
    const taskBrief = context.taskBrief ?? taskBriefFromContext(context);
    return negotiateTask(taskBrief);
  }
}

export function negotiateTask(taskBrief: TaskBrief): TaskNegotiationResult {
  const text = [
    taskBrief.goal,
    taskBrief.currentState,
    ...taskBrief.constraints,
    ...taskBrief.successCriteria,
    ...taskBrief.nonGoals,
  ].join("\n").toLowerCase();

  const detectedTaskType = detectTaskType(text);
  const targetModule = detectTargetModule(taskBrief, detectedTaskType);
  const allowedFiles = extractFileMentions(taskBrief.constraints.filter((item) => /only|仅|只|allowed/i.test(item)));
  const forbiddenFiles = unique([
    ...SENSITIVE_DEFAULTS,
    ...extractFileMentions(taskBrief.constraints.filter((item) => /do not|don't|不要|forbid|禁止/i.test(item))),
    ...extractFileMentions(taskBrief.nonGoals),
  ]);
  const forbiddenModules = extractForbiddenModules(taskBrief);
  const ambiguities = findAmbiguities(taskBrief, targetModule);
  const complexity = inferComplexity(text, ambiguities.length);
  const clarificationQuestions = buildClarificationQuestions(taskBrief, targetModule, ambiguities);
  const suggestedTaskBreakdown = buildBreakdown(detectedTaskType, taskBrief, targetModule, complexity);
  const recommendedNextStep = chooseNextStep(complexity, ambiguities, taskBrief);
  const readyToExecute = recommendedNextStep === "proceed_to_feasibility";

  return {
    negotiationId: `neg_${stableId(taskBrief.taskId, taskBrief.goal, taskBrief.currentState)}`,
    understoodGoal: taskBrief.goal,
    detectedTaskType,
    ...(targetModule ? { targetModule } : {}),
    complexity,
    ambiguities,
    clarificationQuestions,
    proposedScope: {
      allowedModules: targetModule ? [targetModule] : [],
      forbiddenModules,
      ...(allowedFiles.length > 0 ? { allowedFiles } : {}),
      forbiddenFiles,
      allowedActions: readyToExecute
        ? ["inspect_project", "evaluate_feasibility", "draft_plan"]
        : ["inspect_project", "ask_clarifying_questions", "draft_scope_proposal"],
      blockedActions: [
        "execute_code",
        "modify_files",
        "delete_files",
        "run_external_llm",
        "apply_patch_to_source_project",
      ],
      qualityConstraints: unique([
        "Confirm scope before planning or execution.",
        "Preserve user constraints and non-goals.",
        "Do not modify files during negotiation.",
        ...taskBrief.successCriteria,
      ]),
    },
    suggestedTaskBreakdown,
    recommendedNextStep,
    readyToExecute,
    reason: buildReason(recommendedNextStep, complexity, ambiguities),
    createdAt: new Date().toISOString(),
  };
}

function taskBriefFromContext(context: WorkflowContext): TaskBrief {
  return {
    taskId: context.taskId,
    goal: context.userGoal,
    currentState: "No TaskBrief.currentState was provided.",
    constraints: Object.keys(context.constraints ?? {}),
    resources: [],
    budget: "unknown",
    successCriteria: context.successCriteria,
    nonGoals: [],
  };
}

function detectTaskType(text: string): TaskNegotiationResult["detectedTaskType"] {
  if (/\brag\b|retrieval|embedding|rerank|向量|检索|召回/.test(text)) return "rag_optimization";
  if (/bug|fix|failing|test|error|修复|报错|失败/.test(text)) return "coding_fix";
  if (/refactor|重构|rename|拆分|整理/.test(text)) return "refactor";
  if (/doc|readme|文档|说明|quickstart/.test(text)) return "documentation";
  if (/research|调研|分析|比较|方案/.test(text)) return "research";
  return "unknown";
}

function detectTargetModule(taskBrief: TaskBrief, taskType: TaskNegotiationResult["detectedTaskType"]): string | undefined {
  const joined = [taskBrief.goal, taskBrief.currentState, ...taskBrief.constraints].join(" ");
  const moduleMatch = joined.match(/(?:module|模块|目录|area|scope)[:：]\s*([A-Za-z0-9_./-]+)/i);
  if (moduleMatch?.[1]) return moduleMatch[1];
  const files = extractFileMentions(taskBrief.constraints);
  if (files.length > 0) return parentModule(files[0]);
  if (taskType === "rag_optimization") return "rag";
  if (taskType === "documentation") return "docs";
  return undefined;
}

function parentModule(file: string): string {
  const parts = file.split("/");
  return parts.length > 1 ? parts[0] : file;
}

function extractFileMentions(values: string[]): string[] {
  const matches = values.flatMap((value) => value.match(/[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+|[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/g) ?? []);
  return unique(matches);
}

function extractForbiddenModules(taskBrief: TaskBrief): string[] {
  const text = [...taskBrief.constraints, ...taskBrief.nonGoals].join("\n");
  const matches = [...text.matchAll(/(?:do not|don't|不要|禁止|forbid)\s+(?:modify|change|touch|修改)?\s*([A-Za-z0-9_./-]+)/gi)]
    .map((match) => match[1])
    .filter(Boolean);
  return unique(matches);
}

function findAmbiguities(taskBrief: TaskBrief, targetModule: string | undefined): string[] {
  const ambiguities: string[] = [];
  const currentState = taskBrief.currentState.toLowerCase();
  if (!targetModule) ambiguities.push("Target module or file boundary is not explicit.");
  if (taskBrief.currentState.trim().length < 20) ambiguities.push("Current state is too thin to assess scope safely.");
  if (/尚未明确|不明确|unclear|unknown|not sure|unsure/.test(currentState)) {
    ambiguities.push("Current state explicitly says the failing subsystem or cause is unclear.");
  }
  if (taskBrief.successCriteria.length === 0) ambiguities.push("Success criteria are missing.");
  if (taskBrief.constraints.length === 0) ambiguities.push("Constraints are missing.");
  if (/optimi[sz]e|improve|提升|优化/.test(taskBrief.goal.toLowerCase()) && taskBrief.successCriteria.length < 2) {
    ambiguities.push("Optimization goal needs measurable acceptance criteria.");
  }
  return unique(ambiguities);
}

function inferComplexity(text: string, ambiguityCount: number): TaskNegotiationResult["complexity"] {
  if (/full|complete|platform|多人|插件市场|权限系统|替代品|大型|全量/.test(text)) return "high";
  if (ambiguityCount >= 3) return "high";
  if (ambiguityCount > 0 || /refactor|rag|retrieval|integration|迁移|重构/.test(text)) return "medium";
  if (text.trim().length === 0) return "unknown";
  return "low";
}

function buildClarificationQuestions(taskBrief: TaskBrief, targetModule: string | undefined, ambiguities: string[]): string[] {
  const questions: string[] = [];
  if (!targetModule) questions.push("Which module, directory, or file set is in scope?");
  if (ambiguities.some((item) => item.includes("Current state"))) questions.push("What is the current behavior or failure evidence?");
  if (taskBrief.successCriteria.length === 0) questions.push("What exact acceptance criteria should be used?");
  if (taskBrief.constraints.length === 0) questions.push("What files, modules, or actions are explicitly forbidden?");
  if (questions.length === 0) questions.push("Please confirm the proposed scope before feasibility analysis.");
  return questions;
}

function buildBreakdown(
  taskType: TaskNegotiationResult["detectedTaskType"],
  taskBrief: TaskBrief,
  targetModule: string | undefined,
  complexity: TaskNegotiationResult["complexity"],
): TaskNegotiationResult["suggestedTaskBreakdown"] {
  const moduleLabel = targetModule ?? "confirmed target module";
  const riskLevel = complexity === "high" ? "high" : complexity === "medium" ? "medium" : "low";
  const firstTitle = taskType === "rag_optimization" ? "Confirm RAG retrieval scope" : "Confirm task scope";
  return [
    {
      id: "scope_confirmation",
      title: firstTitle,
      goal: `Confirm goal, current state, non-goals, and allowed module boundary for ${moduleLabel}.`,
      expectedOutput: "Human-confirmed scope and clarification answers.",
      riskLevel,
    },
    {
      id: "feasibility_gate",
      title: "Run feasibility gate",
      goal: `Evaluate whether the confirmed scope can proceed without exceeding constraints: ${taskBrief.constraints.join("; ") || "none provided"}.`,
      expectedOutput: "FeasibilityReport with proceed, revise, ask_human, or stop decision.",
      riskLevel: riskLevel === "high" ? "high" : "medium",
    },
  ];
}

function chooseNextStep(
  complexity: TaskNegotiationResult["complexity"],
  ambiguities: string[],
  taskBrief: TaskBrief,
): TaskNegotiationResult["recommendedNextStep"] {
  const text = [taskBrief.goal, ...taskBrief.constraints, ...taskBrief.nonGoals].join("\n").toLowerCase();
  if (/do not proceed|stop|不要继续|停止/.test(text)) return "stop";
  if (complexity === "high") return "split_task";
  if (ambiguities.length > 0) return "ask_human";
  return "proceed_to_feasibility";
}

function buildReason(
  recommendedNextStep: TaskNegotiationResult["recommendedNextStep"],
  complexity: TaskNegotiationResult["complexity"],
  ambiguities: string[],
): string {
  if (recommendedNextStep === "proceed_to_feasibility") return "Scope is specific enough to proceed to feasibility without execution.";
  if (recommendedNextStep === "split_task") return "Task is high complexity and should be split before planning.";
  if (recommendedNextStep === "stop") return "User constraints indicate the task should stop.";
  return `Human confirmation is required before planning because ${ambiguities.join("; ") || "scope confirmation is required"}.`;
}

function stableId(...values: string[]): string {
  return createHash("sha256").update(values.join("\n")).digest("hex").slice(0, 12);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}
