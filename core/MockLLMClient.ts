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
  VerificationReport,
} from "./types.ts";

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
        output = this.generateCritique();
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
    const goal = context.taskBrief?.goal ?? context.userGoal;
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

  private generateCritique(): Critique {
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
    const goal = context.taskBrief?.goal ?? context.userGoal;
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

function requiredContext(request: LLMStructuredRequest) {
  if (!request.context) {
    throw new Error(`MockLLMClient requires context for role: ${request.role}`);
  }
  return request.context;
}
