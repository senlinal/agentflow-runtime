export type DetectedProfileTaskType =
  | "general_answer"
  | "rag_optimization"
  | "coding_fix"
  | "external_project_fix"
  | "frontend_site_build"
  | "unknown";

export type ProfileRoutingDecision = {
  currentProfile: string;
  detectedTaskType: DetectedProfileTaskType;
  recommendedProfile: string | null;
  confidence: "low" | "medium" | "high";
  reason: string;
  shouldSwitch: boolean;
  safeToAutoSwitch: boolean;
  warnings: string[];
};

export type ProfileRoutingRequest = {
  task: string;
  currentProfile: string;
  explicitProfile?: string;
};

type RoutingRule = {
  taskType: DetectedProfileTaskType;
  profile: string;
  confidence: ProfileRoutingDecision["confidence"];
  reason: string;
  patterns: RegExp[];
  safeToAutoSwitch: boolean;
};

const rules: RoutingRule[] = [
  {
    taskType: "general_answer",
    profile: "task-solving",
    confidence: "high",
    reason: "The task asks for an explanation, how-to answer, definition, or conceptual understanding.",
    patterns: [
      /解释/,
      /说明/,
      /怎么做/,
      /什么是/,
      /帮我理解/,
      /讲一下/,
      /如何/,
      /explain/i,
      /what\s+is/i,
      /how\s+to/i,
      /help\s+me\s+understand/i,
    ],
    safeToAutoSwitch: true,
  },
  {
    taskType: "frontend_site_build",
    profile: "frontend-site-build",
    confidence: "high",
    reason: "The task is about building a website, landing page, personal site, HTML/CSS/JS, React/Next.js, or a Claude.ai-style page.",
    patterns: [
      /claude\.ai/i,
      /personal\s+(site|website|homepage)/i,
      /landing\s+page/i,
      /\bwebsite\b/i,
      /\bhtml\b/i,
      /\bcss\b/i,
      /\breact\b/i,
      /next\.?js/i,
      /网站/,
      /个人网站/,
      /个人主页/,
      /落地页/,
      /静态页面/,
      /前端/,
    ],
    safeToAutoSwitch: true,
  },
  {
    taskType: "rag_optimization",
    profile: "rag-optimization",
    confidence: "high",
    reason: "The task references RAG, retrieval, knowledge bases, recall, reranking, embeddings, chunking, or query rewrite.",
    patterns: [
      /\brag\b/i,
      /knowledge\s*base/i,
      /retrieval/i,
      /recall/i,
      /reranker/i,
      /embedding/i,
      /\bchunk/i,
      /query\s*rewrite/i,
      /知识库/,
      /召回/,
      /检索/,
      /重排/,
      /向量/,
      /分块/,
      /查询改写/,
    ],
    safeToAutoSwitch: true,
  },
  {
    taskType: "external_project_fix",
    profile: "external-project-fix",
    confidence: "medium",
    reason: "The task appears to target an external project path or patch-export workflow.",
    patterns: [
      /external\s+project/i,
      /project\s+path/i,
      /patch\s+export/i,
      /export\s+patch/i,
      /外部项目/,
      /真实项目/,
      /导出\s*patch/i,
      /导出补丁/,
    ],
    safeToAutoSwitch: false,
  },
  {
    taskType: "coding_fix",
    profile: "coding-safe-fix",
    confidence: "medium",
    reason: "The task looks like a scoped bug fix, failing-test repair, code change, or refactor.",
    patterns: [
      /\bbug\b/i,
      /failing\s+test/i,
      /\bfix\b/i,
      /\brefactor\b/i,
      /code\s+change/i,
      /修复/,
      /测试失败/,
      /改代码/,
      /重构/,
    ],
    safeToAutoSwitch: false,
  },
];

export class ProfileRouter {
  route(request: ProfileRoutingRequest): ProfileRoutingDecision {
    const task = request.task.trim();
    const explicitProfile = request.explicitProfile?.trim();
    const matched = task ? this.detect(task) : null;
    const recommendedProfile = matched?.profile ?? null;
    const effectiveCurrent = explicitProfile || request.currentProfile;
    const warnings: string[] = [];

    if (!matched) {
      return {
        currentProfile: effectiveCurrent,
        detectedTaskType: "unknown",
        recommendedProfile: null,
        confidence: "low",
        reason: "No profile routing rule matched the task. Keeping the current profile.",
        shouldSwitch: false,
        safeToAutoSwitch: false,
        warnings: task ? ["No task specific profile route was detected."] : ["No task text was provided for profile routing."],
      };
    }

    if (explicitProfile && explicitProfile !== recommendedProfile) {
      warnings.push(`Explicit profile ${explicitProfile} was requested, but router recommends ${recommendedProfile}. Auto-switch is disabled for explicit profile requests.`);
    }

    const shouldSwitch = !explicitProfile && recommendedProfile !== request.currentProfile;
    return {
      currentProfile: effectiveCurrent,
      detectedTaskType: matched.taskType,
      recommendedProfile,
      confidence: matched.confidence,
      reason: matched.reason,
      shouldSwitch,
      safeToAutoSwitch: shouldSwitch ? matched.safeToAutoSwitch : false,
      warnings,
    };
  }

  private detect(task: string): RoutingRule | null {
    for (const rule of rules) {
      if (rule.patterns.some((pattern) => pattern.test(task))) return rule;
    }
    return null;
  }
}
