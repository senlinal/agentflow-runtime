import { TaskBriefLoader } from "../TaskBriefLoader.ts";
import type { TaskBrief } from "../types.ts";
import type { WorkflowProfile } from "./WorkflowProfileLoader.ts";

type BuildProfileTaskInput = {
  profile: WorkflowProfile;
  task: string;
};

export class ProfileTaskInputBuilder {
  build(input: BuildProfileTaskInput): TaskBrief {
    const userRequest = input.task.trim();
    const taskType = detectTaskType(userRequest);
    const expectedDeliverable = expectedDeliverableFor(userRequest, taskType);
    const answerRequirements = answerRequirementsFor(userRequest, taskType);
    return TaskBriefLoader.fromObject({
      taskId: `profile_task_${stableId(input.profile.id, userRequest)}`,
      goal: userRequest,
      userRequest,
      taskType,
      expectedDeliverable,
      ...(answerRequirements ? { answerRequirements } : {}),
      contentQualityCriteria: contentQualityCriteriaFor(taskType),
      currentState: "Provided through profile-aware workflow runner.",
      constraints: input.profile.defaultConstraints ?? [],
      resources: input.profile.policyFiles ?? [],
      budget: "Local profile workflow only. Do not call external LLM providers unless explicitly allowed.",
      successCriteria: successCriteriaFor(taskType),
      nonGoals: input.profile.defaultBlockedActions ?? [],
      rawUserInput: userRequest,
    }, `profile-${input.profile.id}`);
  }
}

function detectTaskType(task: string): TaskBrief["taskType"] {
  if (isGeneralAnswerTask(task)) return "general_answer";
  if (/\brag\b|retrieval|recall|reranker|embedding|\bchunk|query\s*rewrite|知识库|召回|检索|重排|向量|分块|查询改写/i.test(task)) {
    return "rag_optimization";
  }
  if (/project\s+(analysis|review)|analy[sz]e\s+project|项目分析|分析项目|项目结构/.test(task)) return "project_analysis";
  if (/\bbug\b|failing\s+test|\bfix\b|\brefactor\b|code\s+change|修复|测试失败|改代码|重构/i.test(task)) return "coding_fix";
  if (/website|html|css|react|next\.?js|网站|个人主页|落地页|前端/i.test(task)) return "frontend_site_build";
  if (/external\s+project|patch\s+export|外部项目|真实项目|导出补丁/i.test(task)) return "external_project_fix";
  return "unknown";
}

function expectedDeliverableFor(
  task: string,
  taskType: TaskBrief["taskType"],
): TaskBrief["expectedDeliverable"] {
  if (taskType === "general_answer") {
    return {
      type: "answer",
      description: isCoffeeTask(task)
        ? "一份清楚说明咖啡做法的答案。"
        : `一份直接、有用地回答用户请求的答案：${task}`,
    };
  }
  if (taskType === "rag_optimization") {
    return { type: "experiment_plan", description: "A retrieval-quality improvement plan with safe next experimental actions." };
  }
  if (taskType === "project_analysis") {
    return { type: "analysis_report", description: "A project analysis report with structure, strengths, weaknesses, and recommendations." };
  }
  if (taskType === "coding_fix") {
    return { type: "code_change_plan", description: "A safe, scoped code change plan." };
  }
  if (taskType === "frontend_site_build") {
    return { type: "code_change_plan", description: "A frontend build plan with expected files and verification." };
  }
  if (taskType === "external_project_fix") {
    return { type: "patch", description: "A patch-oriented external project fix plan." };
  }
  return { type: "workflow_demo", description: `A task-centered workflow result for: ${task}` };
}

function successCriteriaFor(taskType: TaskBrief["taskType"]): string[] {
  if (taskType === "general_answer") {
    return [
      "Directly answer the user's request.",
      "Include concrete useful content.",
      "Do not only describe the workflow process.",
      "Avoid empty meta statements.",
    ];
  }
  if (taskType === "rag_optimization") {
    return [
      "Analyze retrieval improvement options.",
      "Preserve answer quality constraints.",
      "Do not modify production index.",
      "Produce next experimental actions.",
    ];
  }
  if (taskType === "project_analysis") {
    return [
      "Identify project structure.",
      "Identify strengths and weaknesses.",
      "Provide actionable recommendations.",
    ];
  }
  if (taskType === "coding_fix") {
    return [
      "State the concrete bug or change target.",
      "Keep changes scoped and reviewable.",
      "Preserve tests and safety constraints.",
    ];
  }
  return [
    "Address the user's concrete task.",
    "Produce the expected deliverable content.",
    "Avoid workflow-only meta output.",
  ];
}

function answerRequirementsFor(task: string, taskType: TaskBrief["taskType"]): string[] | undefined {
  if (taskType !== "general_answer") return undefined;
  if (isCoffeeTask(task)) {
    return [
      "materials/tools",
      "step-by-step process",
      "tips or cautions",
      "concise summary",
    ];
  }
  return [
    "clear explanation",
    "important concepts or steps",
    "practical caveats when useful",
    "concise summary",
  ];
}

function contentQualityCriteriaFor(taskType: TaskBrief["taskType"]): string[] {
  return taskType === "general_answer"
    ? ["specific", "non-meta", "directly useful to the user"]
    : ["task-centered", "traceable", "non-meta"];
}

function isGeneralAnswerTask(task: string): boolean {
  return /解释|说明|怎么做|什么是|帮我理解|讲一下|如何|explain|what\s+is|how\s+to|help\s+me\s+understand/i.test(task);
}

function isCoffeeTask(task: string): boolean {
  return /咖啡|coffee/i.test(task);
}

function stableId(...values: string[]): string {
  let hash = 0;
  for (const value of values.join("\n")) hash = (hash * 31 + value.charCodeAt(0)) >>> 0;
  return hash.toString(16);
}
