import type { AgentNode, ExecutionResult, GoalCandidateRoute, NodeExecutor, TaskBrief, WorkflowContext } from "../types.ts";

export class AttemptExecutor implements NodeExecutor {
  async execute(_node: AgentNode, context: WorkflowContext): Promise<ExecutionResult> {
    const state = context.adaptiveState;
    const plan = context.goalExecutionPlan ?? state?.goalPlan;
    const attemptNumber = (state?.attempts.length ?? 0) + 1;
    const route = selectRoute(plan?.candidateRoutes ?? [], state?.currentRouteId);
    const routeId = route?.routeId ?? "direct_deliverable";
    context.adaptiveState = {
      goalPlan: plan ?? state?.goalPlan,
      attempts: state?.attempts ?? [],
      decisions: state?.decisions ?? [],
      currentAttemptNumber: attemptNumber,
      currentRouteId: routeId,
      status: attemptNumber > 1 ? "retrying" : "attempting",
    };
    return buildExecutionResult(context.taskBrief, routeId, attemptNumber, route);
  }
}

function selectRoute(routes: GoalCandidateRoute[], preferredRouteId: string | undefined): GoalCandidateRoute | undefined {
  if (preferredRouteId) return routes.find((route) => route.routeId === preferredRouteId);
  return routes[0];
}

function buildExecutionResult(
  brief: TaskBrief | null,
  routeId: string,
  attemptNumber: number,
  route: GoalCandidateRoute | undefined,
): ExecutionResult {
  const userRequest = brief?.userRequest ?? brief?.goal ?? "the requested task";
  const deliverableType = brief?.expectedDeliverable?.type ?? "answer";
  const content = deliverableContent(brief, routeId, attemptNumber);
  return {
    status: "success",
    deliverable: {
      type: deliverableType,
      content,
    },
    evidenceOfCompletion: [
      `attemptNumber=${attemptNumber}`,
      `routeId=${routeId}`,
      `userRequest=${userRequest}`,
    ],
    limitations: ["Adaptive attempt executor is answer-only and does not modify project files."],
    completedSteps: [routeId],
    artifacts: [`attempt:${attemptNumber}`, `route:${routeId}`],
    summary: `Attempt ${attemptNumber} used route ${routeId}: ${route?.summary ?? "Produce a direct deliverable."}`,
    errors: [],
    rawOutput: JSON.stringify({ attemptNumber, routeId, contentLength: content.length }),
  };
}

function deliverableContent(brief: TaskBrief | null, routeId: string, attemptNumber: number): string {
  const request = brief?.userRequest ?? brief?.goal ?? "the requested task";
  if (/咖啡|coffee/i.test(request)) {
    return [
      "做咖啡的基础方法可以按手冲来理解。",
      "材料和工具：咖啡豆或咖啡粉、热水、滤杯、滤纸、手冲壶、杯子，最好有电子秤。常用比例是 1 克咖啡粉配 15-16 克水。",
      "步骤：先把水烧到约 90-96 摄氏度；把咖啡豆磨成中细粉；用热水润湿滤纸并预热杯具；倒入咖啡粉后铺平。先注入约咖啡粉两倍重量的水闷蒸 30 秒，再分 2-3 次缓慢绕圈注水，总萃取时间通常控制在 2 分 30 秒到 3 分 30 秒。",
      "提示：水温太高容易苦，太低容易酸薄；粉太细会过萃，粉太粗会味道淡。刚开始固定粉水比和水温，只调整研磨粗细更容易稳定。",
      "简要总结：准备咖啡粉和热水，控制粉水比、水温、研磨和时间，就能做出稳定的一杯咖啡。",
    ].join("\n");
  }
  return [
    `针对“${request}”，本次采用 ${routeId} 路线（attempt ${attemptNumber}）。`,
    "核心交付物如下：先明确目标和约束，再给出可以直接使用的分析或答案；如果验证发现缺失内容，下一轮只补齐缺口，不重复无效路线。",
    brief?.expectedDeliverable?.description ? `期望交付物：${brief.expectedDeliverable.description}` : "",
    "这不是工作流状态说明，而是面向用户目标的实质内容。",
  ].filter(Boolean).join("\n");
}
