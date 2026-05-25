import type { LLMClient, LLMStructuredRequest, LLMStructuredResponse } from "./LLMClient.ts";
import type {
  CorrectionHint,
  Critique,
  ExecutionResult,
  FeasibilityReport,
  Plan,
  ResearchReport,
  RevisedPlan,
  SmokeTestResult,
  TaskBrief,
  TaskNegotiationResult,
  VerificationReport,
} from "./types.ts";
import { negotiateTask } from "./negotiation/TaskNegotiatorExecutor.ts";
import { ExecutionVerifier } from "./verification/ExecutionVerifier.ts";

export class MockLLMClient implements LLMClient {
  private verifierCalls = 0;

  async generateStructured<T>(request: LLMStructuredRequest): Promise<LLMStructuredResponse<T>> {
    let output: unknown;
    if (request.outputSchemaName === "SmokeTestResult") {
      output = this.generateSmokeTestResult();
      return {
        output: output as T,
        provider: "mock",
        model: "mock-structured",
        attempts: 1,
      };
    }

    switch (request.role) {
      case "TaskNegotiator":
        output = this.generateTaskNegotiationResult(request);
        break;
      case "Planner":
        output = this.generatePlan(request);
        break;
      case "Researcher":
        output = this.generateResearchReport(request);
        break;
      case "FeasibilityEvaluator":
        output = this.generateFeasibilityReport(request);
        break;
      case "Debater":
        output = this.generateCritique(request);
        break;
      case "PlannerRevision":
        output = this.generateRevisedPlan(request);
        break;
      case "Executor":
        output = this.generateExecutionResult(request);
        break;
      case "Verifier":
        output = this.generateVerificationReport(request);
        break;
      case "GoalKeeper":
        output = this.generateCorrectionHint(request);
        break;
      default:
        throw new Error(`MockLLMClient has no generator for role: ${request.role}`);
    }

    return {
      output: output as T,
      provider: "mock",
      model: "mock-structured",
      attempts: 1,
    };
  }

  private generateTaskNegotiationResult(request: LLMStructuredRequest): TaskNegotiationResult {
    const context = requiredContext(request);
    const brief = context.taskBrief;
    if (!brief) throw new Error("TaskNegotiator requires context.taskBrief.");
    return negotiateTask(brief);
  }

  private generateResearchReport(request: LLMStructuredRequest): ResearchReport {
    const context = requiredContext(request);
    const brief = context.taskBrief;
    if (!brief) throw new Error("Researcher requires context.taskBrief.");
    const tooLarge = isLargeReplacementGoal(brief.goal);

    return {
      summary: tooLarge
        ? "The requested scope is a large product replacement with UI, collaboration, marketplace, permissions, real LLM integration, and deployment."
        : "The requested scope fits the existing configuration-driven runtime and can be explored with local mock components.",
      knownFacts: [
        brief.currentState,
        "Core runtime is configuration-driven and has schema validation, trace persistence, and mock LLM behavior.",
      ],
      unknowns: tooLarge
        ? ["Exact team capacity.", "Production deployment target.", "Security and permission requirements."]
        : ["Exact template catalog needed after this feasibility gate."],
      dependencies: tooLarge
        ? ["Frontend app", "auth and permissions", "real model providers", "deployment platform", "plugin marketplace"]
        : ["Workflow template config", "Researcher and FeasibilityEvaluator mock outputs", "ConditionEvaluator in condition"],
      risks: tooLarge
        ? ["Scope exceeds current phase.", "High integration cost.", "High product and operational risk."]
        : ["Template schema may need refinement before real tool integration."],
      evidence: [
        "No external API is needed for this mock research phase.",
        `Budget constraint: ${brief.budget}`,
      ],
      recommendedNextStep: tooLarge
        ? "Revise the goal into a narrow MVP slice before execution."
        : "Proceed with a feasibility-gated workflow template.",
    };
  }

  private generateFeasibilityReport(request: LLMStructuredRequest): FeasibilityReport {
    const context = requiredContext(request);
    const brief = context.taskBrief;
    if (!brief) throw new Error("FeasibilityEvaluator requires context.taskBrief.");
    const tooLarge = isLargeReplacementGoal(brief.goal);

    if (tooLarge) {
      return {
        feasibility: "low",
        decision: "revise_goal",
        confidence: 0.88,
        costLevel: "high",
        complexityLevel: "high",
        riskLevel: "high",
        blockingIssues: ["Current project has no UI, no real LLM adapter, no auth, and no deployment platform."],
        majorRisks: ["Three-day timeline is not credible for a full Dify replacement.", "Scope spans multiple products."],
        missingInformation: ["User roles.", "Model provider requirements.", "Deployment constraints.", "Collaboration model."],
        requiredResources: ["Product design", "frontend engineering", "backend services", "security review", "model operations"],
        recommendedScope: "Reduce scope to a CLI feasibility-gated workflow runtime with mock executors.",
        alternativePlans: [
          "Build a workflow template library first.",
          "Add one real LLM adapter after mock validation.",
          "Prototype a minimal read-only workflow viewer later.",
        ],
        reason: "Cost, complexity, and risk are too high for the current phase and available project state.",
      };
    }

    return {
      feasibility: "high",
      decision: "proceed_with_risks",
      confidence: 0.82,
      costLevel: "low",
      complexityLevel: "medium",
      riskLevel: "medium",
      blockingIssues: [],
      majorRisks: ["Policy semantics are currently descriptive, not enforced by a permission runtime."],
      missingInformation: ["Future executor types and exact policy enforcement hooks."],
      requiredResources: ["Existing TypeScript core runtime", "MockLLMClient", "node:test"],
      recommendedScope: "Add reusable workflow template metadata and a feasibility gate before planner execution.",
      alternativePlans: ["Only add policy documentation now and defer template execution.", "Add YAML support first."],
      reason: "The goal is aligned with existing runtime abstractions and can be implemented locally without real LLM or UI work.",
    };
  }

  private generatePlan(request: LLMStructuredRequest): Plan {
    const context = requiredContext(request);
    const brief = context.taskBrief;
    const goal = brief?.userRequest ?? brief?.goal ?? context.userGoal;
    if (isDeliverableCenteredBrief(brief)) {
      const answerRequirements = localizeAnswerRequirements(brief.answerRequirements ?? ["direct answer"]);
      return {
        planId: `plan_${context.taskId}_initial`,
        summary: `我理解任务是：${goal}。计划按用户真正要的答案来组织交付。`,
        taskUnderstanding: `用户需要的是：${brief.expectedDeliverable.description}`,
        proposedApproach: "直接回答用户请求，覆盖关键要点，避免只输出工作流说明。",
        deliverablePlan: `输出一份可直接使用的“${goal}”答案。`,
        steps: [
          {
            id: "understand_request",
            action: `识别用户真正的问题：${goal}`,
            expectedOutput: "形成基于原始请求的任务理解。",
          },
          {
            id: "cover_requirements",
            action: `覆盖必要回答要素：${answerRequirements.join("、")}。`,
            expectedOutput: "最终交付物覆盖所有必要回答要素。",
          },
          {
            id: "produce_deliverable",
            action: "写出真实交付内容，而不是描述已经完成。",
            expectedOutput: "用户可以直接使用的答案内容。",
          },
        ],
        risks: ["回答可能变成流程总结，而不是直接回答用户问题。"],
        successCriteria: context.successCriteria,
        successCriteriaMapping: Object.fromEntries(context.successCriteria.map((criterion) => [criterion, "通过生成并检查最终答案内容来覆盖。"])),
        assumptions: ["本次 mock 工作流不调用外部 API 或真实 LLM。"],
      };
    }
    return {
      planId: `plan_${context.taskId}_initial`,
      summary: `我理解任务是：${goal}。计划先明确用户真正要的交付物，再让 Executor 输出具体内容，最后由 Verifier 检查是否真的回答了问题。`,
      steps: [
        {
          id: "step_1",
          action: "明确用户目标、成功标准和最终交付物。",
          expectedOutput: "Planner 能说明要解决什么问题，以及什么结果算完成。",
        },
        {
          id: "step_2",
          action: "按角色流程推进，让 Executor 产出真实内容，而不是只描述流程完成。",
          expectedOutput: "Executor 输出可直接给用户使用的 deliverable.content。",
        },
        {
          id: "step_3",
          action: "让 Verifier 检查交付物是否回答用户请求、是否不是空壳输出。",
          expectedOutput: "Verifier 给出 pass、score 和是否需要返工的判断。",
        },
      ],
      risks: ["如果只展示多角色状态，用户会看到 completed，但看不到每个角色真正说了什么。"],
      successCriteria: context.successCriteria,
      assumptions: ["本次默认使用 mock subagent simulation，不调用真实 LLM。"],
    };
  }

  private generateCritique(request: LLMStructuredRequest): Critique {
    const context = requiredContext(request);
    const brief = context.taskBrief;
    if (isDeliverableCenteredBrief(brief)) {
      return {
        issues: [
          "最终答案必须包含用户请求的内容本身，不能只说工作流完成了。",
          "计划需要显式核对原始用户请求和期望交付物。",
        ],
        risks: ["通用角色输出可能看起来像多 Agent 协作，但没有真正回答用户。"],
        missingRequirements: (brief.answerRequirements ?? []).filter((requirement) =>
          !JSON.stringify(context.plan ?? {}).includes(requirement)
        ).map(localizeAnswerRequirement),
        suggestions: ["让 Executor 产出 deliverable.content，并让 Verifier 拒绝空壳元叙述。"],
        severity: "medium",
      };
    }
    return {
      issues: ["计划方向可行，但必须确保最终答案包含真实内容，而不是只说工作流已经完成。"],
      risks: ["如果 Executor 只输出流程说明，用户会误以为多 Agent 已经工作，但实际没有得到可用结果。"],
      missingRequirements: ["真实交付物内容", "Verifier 对空壳输出的拒绝标准"],
      suggestions: ["要求 Executor 输出具体 deliverable.content，并让 Verifier 检查它是否回答用户请求。"],
      severity: "medium",
    };
  }

  private generateRevisedPlan(request: LLMStructuredRequest): RevisedPlan {
    const context = requiredContext(request);
    const brief = context.taskBrief;
    const goal = brief?.userRequest ?? brief?.goal ?? context.userGoal;
    if (isDeliverableCenteredBrief(brief)) {
      return {
        planId: `plan_${context.taskId}_revised_${context.iteration}`,
        summary: `我已根据 Debater 的意见修订计划：把计划重新聚焦到“${goal}”这个用户交付物。`,
        taskUnderstanding: context.plan?.taskUnderstanding ?? `用户需要的是：${brief.expectedDeliverable.description}`,
        proposedApproach: "先产出具体答案内容，再按原始请求和成功标准验证。",
        deliverablePlan: "Executor 必须返回有实质内容的 deliverable.content。",
        steps: [
          ...(context.plan?.steps ?? []),
          {
            id: "verify_deliverable_fidelity",
            action: "检查 deliverable.content 是否直接满足用户请求，并且不是空壳元叙述。",
            expectedOutput: "Verifier 可以确认 answersUserRequest=true 且 isNotMetaOnly=true。",
          },
        ],
        risks: ["如果 Executor 省略答案正文，工作流必须验证失败。"],
        successCriteria: context.successCriteria,
        successCriteriaMapping: Object.fromEntries(context.successCriteria.map((criterion) => [criterion, "映射到交付物内容或 Verifier 检查。"])),
        assumptions: ["本次 mock 路径不会调用真实模型提供方。"],
        basedOnCritique: context.critique?.suggestions ?? [],
        revisionNotes: ["把计划重新对齐到期望交付物和原始用户请求。"],
      };
    }
    return {
      planId: `plan_${context.taskId}_revised_${context.iteration}`,
      summary: `我已根据 Debater 的意见修订计划：围绕“${goal}”输出真实交付物，并把 Verifier 检查作为结束条件。`,
      steps: [
        ...(context.plan?.steps ?? []),
        {
          id: "step_4",
          action: "如果 Verifier 发现内容不足，再根据 GoalKeeper 的修正意见补充一轮，而不是固定重复流程。",
          expectedOutput: "返工只围绕缺失内容展开，直到通过或明确停止。",
        },
      ],
      risks: ["如果修订计划仍然停留在流程层面，Executor 可能继续输出空壳内容。"],
      successCriteria: context.successCriteria,
      assumptions: ["本次 mock 流程用于验证角色协作和 artifact 展示，不代表真实 LLM-backed agent。"],
      basedOnCritique: context.critique?.suggestions ?? [],
      revisionNotes: context.correctionHint
        ? context.correctionHint.correctionInstructions
        : ["尚无 GoalKeeper 修正意见；先采纳 Debater 的批判，把计划改成以真实交付物为中心。"],
    };
  }

  private generateExecutionResult(request: LLMStructuredRequest): ExecutionResult {
    const context = requiredContext(request);
    const brief = context.taskBrief;
    if (isDeliverableCenteredBrief(brief)) {
      const deliverableContent = buildDeliverableContent(brief);
      return {
        status: "success",
        deliverable: {
          type: brief.expectedDeliverable.type,
          content: deliverableContent,
        },
        evidenceOfCompletion: [
          "deliverable.content is present and non-empty.",
          `Original userRequest preserved: ${brief.userRequest}`,
          `Expected deliverable type: ${brief.expectedDeliverable.type}`,
        ],
        limitations: ["Mock output is deterministic and does not use external references."],
        completedSteps: context.revisedPlan?.steps.map((step) => step.id) ?? ["produce_deliverable"],
        artifacts: [`${brief.expectedDeliverable.type} deliverable`],
        summary: `Produced a concrete ${brief.expectedDeliverable.type} for: ${brief.userRequest}`,
        errors: [],
        rawOutput: JSON.stringify({
          deliverableType: brief.expectedDeliverable.type,
          contentLength: deliverableContent.length,
        }),
      };
    }
    return {
      completedSteps: context.revisedPlan?.steps.map((step) => step.id) ?? [],
      artifacts: ["typed schemas", "schema validator", "mock llm client", "configuration-driven runtime trace"],
      summary: context.correctionHint
        ? "我已根据 GoalKeeper 的意见补充交付物，并保留验证证据。"
        : "我已按修订计划产出第一版结果，等待 Verifier 检查是否需要补充。",
      errors: [],
      rawOutput: JSON.stringify({
        revisedPlanId: context.revisedPlan?.planId,
        correctionApplied: Boolean(context.correctionHint),
      }),
    };
  }

  private generateVerificationReport(request: LLMStructuredRequest): VerificationReport {
    const context = requiredContext(request);
    if (context.codeExecutionResult || context.testExecutionResult) {
      return new ExecutionVerifier().verify(context).report;
    }
    if (isDeliverableCenteredBrief(context.taskBrief) || context.executionResult?.deliverable) {
      return verifyDeliverable(context.taskBrief, context.executionResult, context.successCriteria);
    }

    this.verifierCalls += 1;
    if (this.verifierCalls === 1) {
      return {
        pass: false,
        score: 0.72,
        failedCriteria: ["交付物内容或验证证据还不够完整。"],
        reason: "第一轮检查发现交付物还需要补充具体内容和验证证据。",
        nextAction: "replan",
        feedbackToPlanner: "请按修正意见补充真实交付物内容，并保留可验证 artifact 证据。",
      };
    }

    return {
      pass: true,
      score: 0.96,
      failedCriteria: [],
      reason: "第二轮检查确认交付物内容、修正闭环和 trace 证据都已满足要求。",
      nextAction: "end",
      feedbackToPlanner: "不需要继续返工。",
    };
  }

  private generateCorrectionHint(request: LLMStructuredRequest): CorrectionHint {
    const context = requiredContext(request);
    return {
      driftDetected: false,
      originalGoalReminder: context.taskBrief?.goal ?? context.userGoal,
      failedCriteria: context.verification?.failedCriteria ?? [],
      correctionInstructions: [
        "保持 Runtime 配置驱动，不要在 WorkflowRuntime 中硬编码角色行为。",
        "下一轮必须补充真实交付物内容，而不是只展示角色状态。",
        "保留 output.json、summary.md 和 trace 证据，方便用户核验。",
      ],
      recommendedNextAction: "replan",
    };
  }

  private generateSmokeTestResult(): SmokeTestResult {
    return {
      ok: true,
      provider: "mock",
      model: "mock-structured",
      message: "Mock LLM smoke test passed.",
    };
  }
}

function isLargeReplacementGoal(goal: string): boolean {
  const normalized = goal.toLowerCase();
  return (
    goal.includes("Dify") ||
    goal.includes("替代品") ||
    normalized.includes("marketplace") ||
    goal.includes("插件市场") ||
    goal.includes("多人协作") ||
    goal.includes("部署平台")
  );
}

function isDeliverableCenteredBrief(brief: TaskBrief | null | undefined): brief is TaskBrief {
  return Boolean(brief?.userRequest && brief.expectedDeliverable?.type === "answer" || brief?.taskType === "general_answer");
}

function localizeAnswerRequirements(requirements: string[]): string[] {
  return requirements.map(localizeAnswerRequirement);
}

function localizeAnswerRequirement(requirement: string): string {
  const normalized = requirement.toLowerCase();
  if (normalized.includes("material") || normalized.includes("tool")) return "材料和工具";
  if (normalized.includes("step")) return "具体步骤";
  if (normalized.includes("tip") || normalized.includes("caution")) return "注意事项";
  if (normalized.includes("summary")) return "简要总结";
  if (normalized.includes("direct answer")) return "直接回答";
  return requirement;
}

function buildDeliverableContent(brief: TaskBrief): string {
  if (/咖啡|coffee/i.test(brief.userRequest)) {
    return [
      "做咖啡可以按手冲的基础方法来理解：",
      "",
      "材料和工具：咖啡豆或咖啡粉、热水、滤杯和滤纸、手冲壶、分享壶或杯子、电子秤。常用比例是 1 克咖啡粉配 15-16 克水，例如 15 克粉配 225-240 克水。",
      "",
      "步骤：先把水烧到约 90-96 摄氏度；研磨咖啡豆到中细研磨；用热水冲洗滤纸并预热杯具；倒入咖啡粉后轻轻铺平。先注入约咖啡粉两倍重量的水闷蒸 30 秒，再分 2-3 次缓慢绕圈注水，总萃取时间通常控制在 2 分 30 秒到 3 分 30 秒。咖啡流完后轻轻摇匀即可饮用。",
      "",
      "提示：水温太高容易苦，太低容易酸薄；粉太细会萃取过度，粉太粗会味道淡。刚开始可以固定比例和水温，只调整研磨粗细。没有手冲器具时，也可以用法压壶、摩卡壶或咖啡机，但核心仍是控制粉水比、研磨、水温和时间。",
      "",
      "简要总结：准备咖啡粉和热水，按合适粉水比萃取，控制水温、研磨和时间，就能稳定做出一杯咖啡。",
    ].join("\n");
  }
  if (/\bRAG\b|检索增强|retrieval augmented/i.test(brief.userRequest)) {
    return [
      "RAG（Retrieval-Augmented Generation，检索增强生成）的流程可以理解为：先检索证据，再把证据交给大模型生成回答。",
      "",
      "1. 用户提出问题：系统接收用户问题，并提取关键词、意图或约束。",
      "2. 查询改写或扩展：必要时把原始问题改写成更适合检索的 query，例如补充同义词、拆分复杂问题。",
      "3. 检索候选文档：从知识库、向量库、全文索引或混合检索系统中召回相关片段。",
      "4. 重排与过滤：用 reranker、规则或分数阈值筛掉弱相关内容，把最有用的证据排在前面。",
      "5. 构造上下文：把选中的文档片段、来源、用户问题和回答要求组合成 prompt。",
      "6. 生成回答：大模型基于上下文生成答案，尽量引用检索到的证据，避免凭空编造。",
      "7. 验证与后处理：检查回答是否覆盖问题、是否基于证据、是否有遗漏或冲突；必要时重新检索或让用户澄清。",
      "",
      "影响质量的关键环节通常是召回质量、chunk 切分、embedding/检索策略、reranker 效果、上下文长度控制和答案是否忠实于证据。",
      "",
      "简要总结：RAG = 用户问题 -> 检索相关资料 -> 重排筛选 -> 构造上下文 -> LLM 生成 -> 验证答案。",
    ].join("\n");
  }
  return [
    `针对“${brief.userRequest}”，核心答案如下：`,
    "",
    "先明确问题中的关键概念或目标，再按背景、主要内容、实际意义和注意事项展开。回答应直接服务于用户的问题，而不是描述工作流过程。",
    "",
    `本次期望交付物是：${brief.expectedDeliverable.description}`,
    "",
    "简要总结：围绕用户原始问题给出可直接使用的解释，并补充必要的条件、步骤或限制。",
  ].join("\n");
}

function verifyDeliverable(
  brief: TaskBrief | null | undefined,
  executionResult: ExecutionResult | null | undefined,
  successCriteria: string[],
): VerificationReport {
  const content = executionResult?.deliverable?.content ?? "";
  const deliverableExists = Boolean(executionResult?.deliverable && content.trim().length > 0);
  const isNotMetaOnly = deliverableExists && !isMetaOnly(content);
  const userRequest = brief?.userRequest ?? brief?.goal ?? "";
  const answersUserRequest = deliverableExists && isNotMetaOnly && roughlyAnswers(userRequest, content);
  const missingRequirements = missingAnswerRequirements(brief, content);
  const meetsSuccessCriteria = answersUserRequest && missingRequirements.length === 0 && successCriteria.every((criterion) =>
    !/meta|workflow|empty/i.test(criterion) || isNotMetaOnly
  );
  const pass = deliverableExists && answersUserRequest && meetsSuccessCriteria && isNotMetaOnly;
  const failedCriteria = [
    ...(deliverableExists ? [] : ["deliverable.content must exist."]),
    ...(answersUserRequest ? [] : ["Deliverable must directly answer the user's original request."]),
    ...(isNotMetaOnly ? [] : ["Deliverable must not be workflow-only or meta-only."]),
    ...(meetsSuccessCriteria ? [] : ["Deliverable must meet task-specific success criteria."]),
    ...missingRequirements.map((item) => `Missing answer requirement: ${item}`),
  ];
  return {
    pass,
    deliverableExists,
    answersUserRequest,
    meetsSuccessCriteria,
    isNotMetaOnly,
    missingRequirements,
    score: pass ? 0.97 : 0.35,
    failedCriteria,
    reason: pass
      ? "Deliverable content exists, answers the original user request, and is not meta-only."
      : "Deliverable fidelity check failed.",
    nextAction: pass ? "end" : "replan",
    feedbackToPlanner: pass
      ? "No further replanning required."
      : "Revise the plan so Executor returns substantive deliverable.content for the user request.",
  };
}

function isMetaOnly(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  if (normalized.length < 24) return true;
  return [
    /我(已经|已)执行了/,
    /成功执行计划/,
    /提供了.*解释/,
    /workflow completed/,
    /executed .*plan/,
    /structured output/,
    /已生成结构化/,
  ].some((pattern) => pattern.test(normalized));
}

function roughlyAnswers(userRequest: string, content: string): boolean {
  if (!userRequest) return content.trim().length > 0;
  if (/咖啡|coffee/i.test(userRequest)) return /咖啡|coffee|咖啡豆|粉水比|水温|萃取/.test(content);
  const significant = userRequest
    .replace(/解释|说明|怎么做|什么是|帮我理解|讲一下|如何|一下|the|a|an|what|is|how|to|explain/gi, " ")
    .split(/\s+|，|。|、/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  return significant.length === 0 || significant.some((token) => content.includes(token));
}

function missingAnswerRequirements(brief: TaskBrief | null | undefined, content: string): string[] {
  const requirements = brief?.answerRequirements ?? [];
  return requirements.filter((requirement) => {
    if (requirement === "materials/tools") return !/材料|工具|咖啡豆|咖啡粉|滤杯|滤纸|壶|杯/.test(content);
    if (requirement === "step-by-step process") return !/步骤|先|再|然后|注入|闷蒸|萃取/.test(content);
    if (requirement === "tips or cautions") return !/提示|注意|容易|控制|太高|太低/.test(content);
    if (requirement === "concise summary") return !/总结|简要/.test(content);
    return false;
  });
}

function requiredContext(request: LLMStructuredRequest) {
  if (!request.context) {
    throw new Error(`MockLLMClient requires context for role: ${request.role}`);
  }
  return request.context;
}
