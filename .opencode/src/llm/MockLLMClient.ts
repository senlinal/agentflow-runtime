import type { LLMClient, LLMRequest } from "./LLMClient.ts";

export class MockLLMClient implements LLMClient {
  async completeStructured(request: LLMRequest): Promise<unknown> {
    switch (request.role) {
      case "Planner":
        return this.plan(request);
      case "Debater":
        return this.critique(request);
      case "PlannerRevision":
        return this.revise(request);
      case "Executor":
        return this.execute(request);
      case "Verifier":
        return this.verify(request);
      case "GoalKeeper":
        return this.keepGoal(request);
      default:
        throw new Error(`No mock behavior registered for role: ${request.role}`);
    }
  }

  private plan({ context }: LLMRequest) {
    return {
      summary: `MVP plan for: ${context.userGoal}`,
      steps: [
        {
          id: "step_1",
          title: "Define composable contracts",
          objective: "Specify AgentNode, WorkflowGraph, Context, and structured outputs.",
          inputs: ["userGoal", "constraints", "successCriteria"],
          expectedOutput: "Typed contracts and schemas.",
        },
        {
          id: "step_2",
          title: "Build deterministic runtime",
          objective: "Execute graph nodes, resolve edges, enforce maxIterations, and capture trace.",
          inputs: ["workflow config", "context"],
          expectedOutput: "Runnable WorkflowRuntime.",
        },
        {
          id: "step_3",
          title: "Wire role nodes",
          objective: "Provide Planner, Debater, PlannerRevision, Executor, Verifier, and GoalKeeper nodes.",
          inputs: ["AgentNode abstraction", "LLMClient"],
          expectedOutput: "Reusable role node definitions.",
        },
      ],
      successAlignment: context.successCriteria.slice(0, 1),
      risks: ["Initial plan may under-specify verification and trace presentation."],
    };
  }

  private critique() {
    return {
      issues: ["The plan should explicitly align every success criterion with runtime behavior."],
      risks: ["Verifier routing can become ambiguous if pass/fail is not represented structurally."],
      unclearItems: ["How execution trace summaries will be generated."],
      recommendedChanges: [
        "Add a success-criteria mapping to the revised plan.",
        "Make Verifier.nextAction a constrained enum used by Runtime edges.",
      ],
    };
  }

  private revise({ context }: LLMRequest) {
    const correction = context.correctionHint?.correctionHint;
    const baseSteps = context.plan?.steps ?? [];
    return {
      summary: `Revised MVP plan for: ${context.userGoal}`,
      steps: [
        ...baseSteps,
        {
          id: "step_4",
          title: "Demonstrate recovery loop",
          objective: "Force a failed verification path and show GoalKeeper-guided replanning.",
          inputs: ["verification", "correctionHint"],
          expectedOutput: "Trace proves pass/fail routing and loop control.",
        },
      ],
      successAlignment: context.successCriteria.length
        ? context.successCriteria
        : [
            "Runtime controls deterministic edges.",
            "Agents exchange structured Context only.",
            "Trace records every step.",
          ],
      risks: ["Mock execution is not proof of external side effects."],
      revisionNotes: [
        "Addressed Debater feedback by adding explicit success alignment.",
        correction ?? "No correction hint was available on first revision.",
      ],
      addressedCritique: context.critique?.recommendedChanges ?? [],
      appliedCorrectionHint: Boolean(correction),
    };
  }

  private execute({ context }: LLMRequest) {
    const appliedCorrection = Boolean(context.revisedPlan?.appliedCorrectionHint);
    return {
      status: "completed",
      artifacts: [
        {
          name: "workflow-runtime-mvp",
          type: "design+mock-implementation",
          content: appliedCorrection
            ? "Runtime, nodes, schemas, config loading, conditional routing, recovery loop, and full trace are represented."
            : "Runtime, nodes, and config loading are represented, but trace/success mapping needs stronger evidence.",
        },
      ],
      summary: appliedCorrection
        ? "Executed revised plan with correction hint applied and explicit success-criteria coverage."
        : "Executed first revised plan; implementation sketch is incomplete around verification evidence.",
      evidence: [
        "Agent outputs are schema-validated.",
        "Runtime, not LLM, resolves graph edges.",
        ...(appliedCorrection ? ["Trace and correction loop are explicitly demonstrated."] : []),
      ],
      errors: [],
    };
  }

  private verify({ context }: LLMRequest) {
    const recovered = Boolean(context.revisedPlan?.appliedCorrectionHint);
    if (!recovered) {
      return {
        pass: false,
        score: 0.72,
        failedCriteria: ["没有覆盖用户指定的成功标准", "缺少验证失败后的纠偏循环证据"],
        reason: "当前结果缺少关键步骤，尤其是 trace 展示和 GoalKeeper 回路证据。",
        nextAction: "replan",
        feedbackToPlanner: "下一轮计划必须补充缺失步骤，并显式对齐用户成功标准。",
      };
    }

    return {
      pass: true,
      score: 0.94,
      failedCriteria: [],
      reason: "修订后结果覆盖结构化 Context、条件跳转、失败重规划、maxIterations 和完整 trace。",
      nextAction: "end",
      feedbackToPlanner: "No further planning required.",
    };
  }

  private keepGoal({ context }: LLMRequest) {
    return {
      originalGoal: context.userGoal,
      failureReason: context.verification?.reason ?? "Unknown verification failure.",
      correctionHint:
        "保持目标聚焦在可组合 Agent 工作流 MVP；下一轮必须补齐 trace 展示、成功标准映射、Verifier 条件跳转和失败重规划循环。",
      mustPreserve: [
        "Workflow Runtime owns deterministic control flow.",
        "Agents communicate through structured Context.",
        "LLMClient remains replaceable.",
      ],
      avoid: ["不要把节点之间的自由聊天当作调度机制。", "不要引入复杂 UI。"],
      nextPlannerFocus: ["trace completeness", "schema validation", "replan loop", "success criteria coverage"],
    };
  }
}
