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
      return {
        planId: `plan_${context.taskId}_initial`,
        summary: `Plan to produce the requested deliverable for: ${goal}`,
        taskUnderstanding: `The user needs ${brief.expectedDeliverable.description}`,
        proposedApproach: "Answer the user request directly, cover the stated requirements, and avoid workflow-only meta narration.",
        deliverablePlan: `Produce a ${brief.expectedDeliverable.type} with concrete content for: ${goal}`,
        steps: [
          {
            id: "understand_request",
            action: `Identify the real user question: ${goal}`,
            expectedOutput: "A task understanding grounded in the original user request.",
          },
          {
            id: "cover_requirements",
            action: `Cover required answer elements: ${(brief.answerRequirements ?? ["direct answer"]).join(", ")}.`,
            expectedOutput: "All answer requirements are represented in the final deliverable.",
          },
          {
            id: "produce_deliverable",
            action: "Write the actual deliverable content, not a description of having done it.",
            expectedOutput: `${brief.expectedDeliverable.type} content that the user can use immediately.`,
          },
        ],
        risks: ["The response could become a process summary instead of answering the user's real request."],
        successCriteria: context.successCriteria,
        successCriteriaMapping: Object.fromEntries(context.successCriteria.map((criterion) => [criterion, "Covered by producing and checking the final deliverable content."])),
        assumptions: ["The task can be answered without external API calls in the mock workflow."],
      };
    }
    return {
      planId: `plan_${context.taskId}_initial`,
      summary: `Initial structured plan for: ${goal}`,
      steps: [
        {
          id: "step_1",
          action: "Define domain types and workflow configuration contracts.",
          expectedOutput: "Typed core runtime contracts.",
        },
        {
          id: "step_2",
          action: "Execute nodes using a registered NodeExecutor.",
          expectedOutput: "Runtime can execute arbitrary configured graph nodes.",
        },
        {
          id: "step_3",
          action: "Verify structured execution results and route by configured conditions.",
          expectedOutput: "Verifier output drives graph edges through ConditionEvaluator.",
        },
      ],
      risks: ["Mock output can hide real LLM formatting failures."],
      successCriteria: context.successCriteria,
      assumptions: ["Phase three keeps execution local and does not call real model providers."],
    };
  }

  private generateCritique(request: LLMStructuredRequest): Critique {
    const context = requiredContext(request);
    const brief = context.taskBrief;
    if (isDeliverableCenteredBrief(brief)) {
      return {
        issues: [
          "The final answer must contain the requested content itself, not just say the workflow completed.",
          "The plan should explicitly check the original user request and expected deliverable.",
        ],
        risks: ["A generic role output could look multi-agent but fail to answer the user."],
        missingRequirements: (brief.answerRequirements ?? []).filter((requirement) =>
          !JSON.stringify(context.plan ?? {}).includes(requirement)
        ),
        suggestions: ["Make Executor produce deliverable.content and make Verifier reject meta-only content."],
        severity: "medium",
      };
    }
    return {
      issues: ["The initial plan must explicitly prove schema validation and trace persistence."],
      risks: ["A runtime without output validation can corrupt context state."],
      missingRequirements: ["Stable structured role output schemas.", "Verifier nextAction enum validation."],
      suggestions: ["Validate every node output before writing it into context."],
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
        summary: `Revised plan focused on the user deliverable for: ${goal}`,
        taskUnderstanding: context.plan?.taskUnderstanding ?? `The user needs ${brief.expectedDeliverable.description}`,
        proposedApproach: "Produce concrete deliverable content first, then verify it against the original request and success criteria.",
        deliverablePlan: `Executor must return deliverable.type=${brief.expectedDeliverable.type} with substantive content.`,
        steps: [
          ...(context.plan?.steps ?? []),
          {
            id: "verify_deliverable_fidelity",
            action: "Check that deliverable.content directly satisfies the user request and is not meta-only.",
            expectedOutput: "Verifier can mark answersUserRequest=true and isNotMetaOnly=true.",
          },
        ],
        risks: ["If the executor omits the answer body, the workflow must fail verification."],
        successCriteria: context.successCriteria,
        successCriteriaMapping: Object.fromEntries(context.successCriteria.map((criterion) => [criterion, "Mapped to deliverable content or verifier checks."])),
        assumptions: ["No real model provider is called in this mock path."],
        basedOnCritique: context.critique?.suggestions ?? [],
        revisionNotes: ["Re-centered the plan on the expected deliverable and original user request."],
      };
    }
    return {
      planId: `plan_${context.taskId}_revised_${context.iteration}`,
      summary: `Revised structured plan for: ${goal}`,
      steps: [
        ...(context.plan?.steps ?? []),
        {
          id: "step_4",
          action: "Use GoalKeeper correction instructions after verifier failure.",
          expectedOutput: "Second verification can pass without Runtime hardcoding role behavior.",
        },
      ],
      risks: ["Schema validation is still hand-written and intentionally minimal."],
      successCriteria: context.successCriteria,
      assumptions: ["MockLLMClient controls the fail-then-pass verifier scenario."],
      basedOnCritique: context.critique?.suggestions ?? [],
      revisionNotes: context.correctionHint
        ? context.correctionHint.correctionInstructions
        : ["No correction hint available yet; applied critique only."],
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
        ? "Executed revised plan after GoalKeeper correction with structured output validation."
        : "Executed first revised plan; verifier should request one correction cycle.",
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
        failedCriteria: ["Structured output validation and recovery loop need one more pass."],
        reason: "First verifier pass intentionally fails to exercise GoalKeeper and replanning.",
        nextAction: "replan",
        feedbackToPlanner: "Use correction instructions and explicitly preserve schema validation evidence.",
      };
    }

    return {
      pass: true,
      score: 0.96,
      failedCriteria: [],
      reason: "The second verifier pass confirms schema validation, correction loop, and trace output.",
      nextAction: "end",
      feedbackToPlanner: "No further replanning required.",
    };
  }

  private generateCorrectionHint(request: LLMStructuredRequest): CorrectionHint {
    const context = requiredContext(request);
    return {
      driftDetected: false,
      originalGoalReminder: context.taskBrief?.goal ?? context.userGoal,
      failedCriteria: context.verification?.failedCriteria ?? [],
      correctionInstructions: [
        "Keep the runtime configuration-driven.",
        "Do not move role-specific output behavior into WorkflowRuntime.",
        "Make the next revised plan show schema validation and trace persistence explicitly.",
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
