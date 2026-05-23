import { ScopeConfirmationService } from "../scope/ScopeConfirmationService.ts";
import { ScopeConfirmationStore } from "../scope/ScopeConfirmationStore.ts";
import { TaskBriefLoader } from "../TaskBriefLoader.ts";
import type { ProfileSession, ProjectMemoryRecord, ProjectMemorySummary, ScopeConfirmationRecord, TaskBrief, TaskNegotiationResult, WorkflowGraphConfig } from "../types.ts";
import { WorkflowRunner, type WorkflowRunnerResult } from "../WorkflowRunner.ts";
import { WorkflowTemplateRegistry } from "../WorkflowTemplateRegistry.ts";
import { WorkflowProfileLoader, type WorkflowProfile } from "./WorkflowProfileLoader.ts";
import { ProfileSessionStore } from "./ProfileSessionStore.ts";
import { ProjectMemoryStore } from "./ProjectMemoryStore.ts";

export type ProfileWorkflowRunRequest = {
  profileId?: string;
  task?: string;
  inputPath?: string;
  scopeConfirmationId?: string;
  sessionId?: string;
  answer?: string;
  dryRun?: boolean;
  allowExecution?: boolean;
};

export type ProfileWorkflowStep = {
  workflow: string;
  status: "planned" | "ran" | "skipped" | "blocked";
  reason: string;
  runId?: string;
  summaryPath?: string;
  tracePath?: string;
  finalStatus?: "passed" | "stopped" | "not-passed";
  enteredExecutor?: boolean;
};

export type ProfileWorkflowRunResult = {
  profileId: string;
  profileName: string;
  workflowChain: string[];
  taskBrief: TaskBrief;
  dryRun: boolean;
  allowExecution: boolean;
  steps: ProfileWorkflowStep[];
  warnings: string[];
  finalStatus: "planned" | "completed" | "blocked" | "stopped";
  nextActions: string[];
  session?: ProfileSession;
  scopeConfirmationId?: string;
  memorySummary?: ProjectMemorySummary;
};

export class ProfileWorkflowRunner {
  private readonly profileLoader: WorkflowProfileLoader;
  private readonly workflowRegistry: WorkflowTemplateRegistry;
  private readonly workflowRunner: WorkflowRunner;
  private readonly sessionStore: ProfileSessionStore;
  private readonly scopeStore: ScopeConfirmationStore;
  private readonly memoryStore: ProjectMemoryStore;

  constructor(
    profileLoader = new WorkflowProfileLoader(),
    workflowRegistry = new WorkflowTemplateRegistry(),
    workflowRunner = new WorkflowRunner(),
    sessionStore = new ProfileSessionStore(),
    scopeStore = new ScopeConfirmationStore(),
    memoryStore = new ProjectMemoryStore(),
  ) {
    this.profileLoader = profileLoader;
    this.workflowRegistry = workflowRegistry;
    this.workflowRunner = workflowRunner;
    this.sessionStore = sessionStore;
    this.scopeStore = scopeStore;
    this.memoryStore = memoryStore;
  }

  async run(request: ProfileWorkflowRunRequest): Promise<ProfileWorkflowRunResult> {
    const profileResolution = request.profileId
      ? await this.resolveExplicitProfile(request.profileId)
      : await this.profileLoader.loadCurrentProfile();
    const profile = profileResolution.profile;
    const validation = await this.profileLoader.validateProfile(profile);
    if (!validation.valid) throw new Error(`Workflow profile is invalid: ${validation.errors.join("; ")}`);

    const resume = request.answer ? await this.resumeScopeConfirmation(request, profile) : null;
    let taskBrief = resume?.taskBrief ?? await this.resolveTaskBrief(request, profile);
    const workflowChain = this.profileLoader.resolveProfileWorkflowChain(profile);
    const dryRun = request.dryRun === true;
    const allowExecution = request.allowExecution === true;
    const steps: ProfileWorkflowStep[] = [];
    const warnings = [...validation.warnings];
    const initialMemorySummary = await this.memoryStore.summarize(profile.id, 10);
    if (initialMemorySummary.records.length > 0) {
      warnings.push(`Loaded ${initialMemorySummary.records.length} project memory record(s) for profile ${profile.id}.`);
      taskBrief = withMemoryResources(taskBrief, initialMemorySummary);
    }
    let blocked = false;

    let profileSession: ProfileSession | undefined = resume?.session;

    const scopeConfirmation = resume?.scopeConfirmation
      ?? (request.scopeConfirmationId ? await this.scopeStore.get(request.scopeConfirmationId) : null);

    for (const workflow of workflowChain) {
      if (blocked) {
        steps.push({ workflow, status: "skipped", reason: "Previous profile step blocked continuation." });
        continue;
      }

      const { config } = await this.workflowRegistry.load(workflow);
      const isScopeWorkflow = profile.scopeWorkflow === workflow;
      const executionWorkflow = isExecutionWorkflow(config);

      if (dryRun) {
        steps.push({ workflow, status: "planned", reason: "Dry-run only. Workflow was not executed." });
        continue;
      }

      if (executionWorkflow && !allowExecution) {
        steps.push({
          workflow,
          status: "blocked",
          reason: "Workflow contains execution-capable nodes and allowExecution=false.",
        });
        blocked = true;
        continue;
      }

      if (isScopeWorkflow && !scopeConfirmation) {
        steps.push({
          workflow,
          status: "blocked",
          reason: "Scope workflow requires a ScopeConfirmationRecord. Provide scopeConfirmationId after human confirmation.",
        });
        blocked = true;
        continue;
      }

      const result = await this.workflowRunner.run(config, taskBrief, {
        contextOverrides: scopeConfirmation ? { scopeConfirmationRecord: scopeConfirmation } : undefined,
      });
      steps.push(toStep(workflow, result));

      if (workflow === profile.defaultWorkflow && !profileSession) {
        const created = await this.createPendingSession(profile, taskBrief, result);
        if (created) profileSession = created;
      }
    }

    if (profileSession && steps.some((step) => step.status === "ran") && !steps.some((step) => step.status === "blocked")) {
      profileSession = await this.updateSession(profileSession, {
        status: "completed",
        lastRunId: [...steps].reverse().find((step) => step.runId)?.runId ?? profileSession.lastRunId,
      });
    }
    await this.writeRouteMemory(profile.id, profileSession, steps);
    const memorySummary = await this.memoryStore.summarize(profile.id, 10);

    return {
      profileId: profile.id,
      profileName: profile.name,
      workflowChain,
      taskBrief,
      dryRun,
      allowExecution,
      steps,
      warnings,
      finalStatus: finalProfileStatus(steps, dryRun),
      nextActions: nextActions(profile, steps, memorySummary),
      memorySummary,
      ...(profileSession ? { session: profileSession } : {}),
      ...(scopeConfirmation?.confirmationId ? { scopeConfirmationId: scopeConfirmation.confirmationId } : {}),
    };
  }

  private async createPendingSession(
    profile: WorkflowProfile,
    taskBrief: TaskBrief,
    result: WorkflowRunnerResult,
  ): Promise<ProfileSession | null> {
    const negotiation = result.context.taskNegotiationResult;
    if (!negotiation || negotiation.clarificationQuestions.length === 0 || !profile.scopeWorkflow) return null;
    const now = new Date().toISOString();
    const session: ProfileSession = {
      sessionId: `profile_session_${stableId(profile.id, negotiation.negotiationId, taskBrief.goal)}`,
      profileId: profile.id,
      status: "pending_scope_confirmation",
      task: taskBrief.rawUserInput ?? taskBrief.goal,
      negotiationId: negotiation.negotiationId,
      lastRunId: result.runId,
      pendingQuestions: negotiation.clarificationQuestions,
      proposedScope: negotiation.proposedScope,
      taskNegotiationResult: negotiation,
      createdAt: now,
      updatedAt: now,
    };
    await this.sessionStore.save(session);
    return session;
  }

  private async resumeScopeConfirmation(
    request: ProfileWorkflowRunRequest,
    profile: WorkflowProfile,
  ): Promise<{ session: ProfileSession; scopeConfirmation: ScopeConfirmationRecord; taskBrief: TaskBrief }> {
    const session = request.sessionId
      ? await this.sessionStore.get(request.sessionId)
      : await this.sessionStore.getCurrent(profile.id);
    if (!session) throw new Error(`No pending profile session found for profile ${profile.id}.`);
    if (session.profileId !== profile.id) throw new Error(`Profile session ${session.sessionId} belongs to ${session.profileId}, not ${profile.id}.`);
    if (session.status !== "pending_scope_confirmation") throw new Error(`Profile session ${session.sessionId} is ${session.status}, not pending_scope_confirmation.`);
    if (!session.taskNegotiationResult) throw new Error(`Profile session ${session.sessionId} is missing taskNegotiationResult.`);

    const answer = request.answer ?? "";
    const record = new ScopeConfirmationService().createRecord({
      negotiation: session.taskNegotiationResult,
      confirmedBy: "profile-session-user",
      confirmedScope: inferConfirmedScope(session.taskNegotiationResult, answer),
      userAnswers: session.pendingQuestions.map((question) => ({ question, answer })),
      assumptionsAccepted: session.taskNegotiationResult.ambiguities,
      notes: `Created from profile session ${session.sessionId}.`,
    });
    await this.scopeStore.save(record);
    await this.writeScopeMemory(profile, session, record, answer);
    const updated = await this.updateSession(session, {
      status: "scope_confirmed",
      scopeConfirmationId: record.confirmationId,
    });
    return {
      session: updated,
      scopeConfirmation: record,
      taskBrief: await this.resolveTaskBrief({ ...request, task: session.task, inputPath: undefined, answer: undefined }, profile),
    };
  }

  private async writeScopeMemory(
    profile: WorkflowProfile,
    session: ProfileSession,
    record: ScopeConfirmationRecord,
    answer: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const baseSource = {
      sessionId: session.sessionId,
      confirmationId: record.confirmationId,
      workflowRunId: session.lastRunId,
    };
    await this.memoryStore.save({
      memoryId: `memory_scope_${stableId(profile.id, record.confirmationId)}`,
      profileId: profile.id,
      type: "confirmed_scope",
      title: `Confirmed scope for ${record.confirmedScope.targetModule ?? profile.id}`,
      summary: [
        `Goal: ${record.confirmedScope.goal}`,
        `Allowed modules: ${record.confirmedScope.allowedModules.join(", ") || "none"}`,
        `Blocked actions: ${record.confirmedScope.blockedActions.join(", ") || "none"}`,
        `Quality constraints: ${record.confirmedScope.qualityConstraints.join("; ") || "none"}`,
      ].join(" | "),
      source: baseSource,
      tags: ["scope", profile.id, record.confirmedScope.targetModule ?? "general"],
      status: "active",
      createdAt: now,
    });
    await this.memoryStore.save({
      memoryId: `memory_decision_${stableId(profile.id, record.confirmationId, "answer")}`,
      profileId: profile.id,
      type: "decision",
      title: "Human scope confirmation captured",
      summary: `User confirmed scope answer: ${answer.slice(0, 240)}`,
      source: baseSource,
      tags: ["decision", "human-confirmed-scope", profile.id],
      status: "active",
      createdAt: now,
    });
    await this.memoryStore.save({
      memoryId: `memory_next_${stableId(profile.id, record.confirmationId, "next")}`,
      profileId: profile.id,
      type: "next_action",
      title: "Proceed within confirmed scope",
      summary: "Use confirmed scope as the boundary for feasibility and followup planning. Do not expand scope without another confirmation.",
      source: baseSource,
      tags: ["next-action", "scope-gated", profile.id],
      status: "active",
      createdAt: now,
    });
  }

  private async writeRouteMemory(
    profileId: string,
    session: ProfileSession | undefined,
    steps: ProfileWorkflowStep[],
  ): Promise<void> {
    const now = new Date().toISOString();
    for (const step of steps) {
      if (step.status === "ran") {
        await this.memoryStore.save({
          memoryId: `memory_route_${stableId(profileId, session?.sessionId ?? "no-session", step.workflow, step.runId ?? "no-run")}`,
          profileId,
          type: "tried_route",
          title: `Ran workflow ${step.workflow}`,
          summary: `${step.workflow} completed with status ${step.finalStatus ?? "unknown"}. enteredExecutor=${step.enteredExecutor ?? false}.`,
          source: { sessionId: session?.sessionId, workflowRunId: step.runId },
          tags: ["route", step.workflow],
          status: "active",
          createdAt: now,
        });
      }
      if (step.status === "blocked") {
        await this.memoryStore.save({
          memoryId: `memory_rejected_route_${stableId(profileId, session?.sessionId ?? "no-session", step.workflow, step.reason)}`,
          profileId,
          type: "rejected_route",
          title: `Blocked workflow ${step.workflow}`,
          summary: step.reason,
          source: { sessionId: session?.sessionId, workflowRunId: step.runId },
          tags: ["blocked-route", step.workflow],
          status: "active",
          createdAt: now,
        });
      }
    }
  }

  private async updateSession(session: ProfileSession, update: Partial<ProfileSession>): Promise<ProfileSession> {
    const updated = { ...session, ...update, updatedAt: new Date().toISOString() };
    await this.sessionStore.save(updated);
    return updated;
  }

  private async resolveExplicitProfile(profileId: string) {
    const { profile, sourcePath } = await this.profileLoader.loadProfile(profileId);
    const validation = await this.profileLoader.validateProfile(profile);
    return {
      current: { activeProfile: profile.id },
      profile,
      validation,
      workflowChain: this.profileLoader.resolveProfileWorkflowChain(profile),
      sourcePath,
    };
  }

  private async resolveTaskBrief(request: ProfileWorkflowRunRequest, profile: WorkflowProfile): Promise<TaskBrief> {
    if (request.inputPath) return TaskBriefLoader.loadJson(request.inputPath);
    if (request.task) {
      return TaskBriefLoader.fromObject({
        goal: request.task,
        currentState: "Provided through profile-aware workflow runner.",
        constraints: profile.defaultConstraints ?? [],
        resources: [],
        budget: "not specified",
        successCriteria: ["Produce structured profile-aware workflow output."],
        nonGoals: profile.defaultBlockedActions ?? [],
        rawUserInput: request.task,
      }, `profile-${profile.id}`);
    }
    if (profile.defaultInput) return TaskBriefLoader.loadJson(profile.defaultInput);
    throw new Error("Profile workflow run requires --task, --input, or profile.defaultInput.");
  }
}

function isExecutionWorkflow(config: WorkflowGraphConfig): boolean {
  return config.nodes.some((node) =>
    ["code", "test", "materialize", "approval", "dryRun", "execute"].includes(node.type)
  );
}

function toStep(workflow: string, result: WorkflowRunnerResult): ProfileWorkflowStep {
  const context = result.context;
  const enteredExecutor = context.trace.some((item) =>
    item.nodeId === "executor" || item.role === "Executor" || item.role === "CodeExecutor" || item.role === "TestRunner"
  );
  return {
    workflow,
    status: "ran",
    reason: "Workflow completed under profile runner.",
    runId: result.runId,
    summaryPath: result.summaryPath,
    tracePath: result.tracePath,
    finalStatus: context.stopReason ? "stopped" : context.verification?.pass ? "passed" : "not-passed",
    enteredExecutor,
  };
}

function finalProfileStatus(steps: ProfileWorkflowStep[], dryRun: boolean): ProfileWorkflowRunResult["finalStatus"] {
  if (dryRun) return "planned";
  if (steps.some((step) => step.status === "blocked")) return "blocked";
  if (steps.some((step) => step.finalStatus === "stopped")) return "stopped";
  return "completed";
}

function withMemoryResources(taskBrief: TaskBrief, memorySummary: ProjectMemorySummary): TaskBrief {
  const memoryResources = memorySummary.records.slice(0, 5).map((record) =>
    `ProjectMemory(${record.type}): ${record.title} - ${record.summary}`
  );
  return {
    ...taskBrief,
    resources: [...taskBrief.resources, ...memoryResources],
  };
}

function nextActions(profile: WorkflowProfile, steps: ProfileWorkflowStep[], memorySummary?: ProjectMemorySummary): string[] {
  const blocked = steps.find((step) => step.status === "blocked");
  if (blocked?.workflow === profile.scopeWorkflow) {
    return [
      "Answer clarification questions from task-negotiation.",
      "Create or select a ScopeConfirmationRecord.",
      "Run again with scopeConfirmationId to pass confirmed-scope-gate.",
    ];
  }
  if (blocked) {
    return [
      "Review the blocked workflow reason.",
      "Use explicit approval and a dedicated execution workflow only when safe.",
    ];
  }
  const memoryAction = memorySummary?.nextActions[0]?.summary;
  return [
    "Review generated summary and trace.",
    memoryAction ?? "Proceed only within the active profile scope.",
  ];
}

function inferConfirmedScope(
  negotiation: TaskNegotiationResult,
  answer: string,
): Partial<ScopeConfirmationRecord["confirmedScope"]> {
  const lower = answer.toLowerCase();
  const recallLevel = lower.includes("heading") || answer.includes("标题")
    ? "heading"
    : lower.includes("file") || answer.includes("文件")
      ? "file"
      : lower.includes("answer") || answer.includes("答案")
        ? "answer"
        : lower.includes("chunk") || answer.includes("分块")
          ? "chunk"
          : "unknown";
  const allowRerankerChanges = /reranker|重排/.test(lower);
  const allowQueryRewrite = /query rewrite|query[- ]?rewrite|查询改写|改写/.test(lower);
  const productionChangesAllowed = !/(不改生产|不要改生产|no production|do not.*production)/.test(lower);
  const allowAnswerQualityRegression = !/(不牺牲回答质量|不降低回答质量|no answer quality regression|do not.*quality)/.test(lower);

  if (negotiation.detectedTaskType !== "rag_optimization") {
    return {
      allowedActions: ["inspect_project", "evaluate_feasibility"],
    };
  }

  return {
    allowedActions: ["inspect_project", "evaluate_feasibility"],
    metricDefinition: {
      primaryMetric: "RAG retrieval quality using human-confirmed recall and answer-quality constraints",
      secondaryMetrics: ["answer quality", "citation coverage"],
      targetValue: "Improve retrieval without violating confirmed answer-quality constraints",
      evaluationDataset: "User-confirmed evaluation examples or previous experiment results",
    },
    ragConstraints: {
      recallLevel,
      allowChunkChanges: lower.includes("chunk") || answer.includes("分块"),
      allowIndexRebuild: !/(不改.*索引|no index|do not.*index|不重建索引)/.test(lower),
      allowRerankerChanges,
      allowQueryRewrite,
      allowAnswerQualityRegression,
      productionChangesAllowed,
    },
  };
}

function stableId(...values: string[]): string {
  let hash = 0;
  for (const value of values.join("\n")) hash = (hash * 31 + value.charCodeAt(0)) >>> 0;
  return hash.toString(16);
}
