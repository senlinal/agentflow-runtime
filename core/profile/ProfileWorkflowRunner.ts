import { ScopeConfirmationStore } from "../scope/ScopeConfirmationStore.ts";
import { TaskBriefLoader } from "../TaskBriefLoader.ts";
import type { ScopeConfirmationRecord, TaskBrief, WorkflowGraphConfig } from "../types.ts";
import { WorkflowRunner, type WorkflowRunnerResult } from "../WorkflowRunner.ts";
import { WorkflowTemplateRegistry } from "../WorkflowTemplateRegistry.ts";
import { WorkflowProfileLoader, type WorkflowProfile } from "./WorkflowProfileLoader.ts";

export type ProfileWorkflowRunRequest = {
  profileId?: string;
  task?: string;
  inputPath?: string;
  scopeConfirmationId?: string;
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
};

export class ProfileWorkflowRunner {
  private readonly profileLoader: WorkflowProfileLoader;
  private readonly workflowRegistry: WorkflowTemplateRegistry;
  private readonly workflowRunner: WorkflowRunner;

  constructor(
    profileLoader = new WorkflowProfileLoader(),
    workflowRegistry = new WorkflowTemplateRegistry(),
    workflowRunner = new WorkflowRunner(),
  ) {
    this.profileLoader = profileLoader;
    this.workflowRegistry = workflowRegistry;
    this.workflowRunner = workflowRunner;
  }

  async run(request: ProfileWorkflowRunRequest): Promise<ProfileWorkflowRunResult> {
    const profileResolution = request.profileId
      ? await this.resolveExplicitProfile(request.profileId)
      : await this.profileLoader.loadCurrentProfile();
    const profile = profileResolution.profile;
    const validation = await this.profileLoader.validateProfile(profile);
    if (!validation.valid) throw new Error(`Workflow profile is invalid: ${validation.errors.join("; ")}`);

    const taskBrief = await this.resolveTaskBrief(request, profile);
    const workflowChain = this.profileLoader.resolveProfileWorkflowChain(profile);
    const dryRun = request.dryRun === true;
    const allowExecution = request.allowExecution === true;
    const steps: ProfileWorkflowStep[] = [];
    const warnings = [...validation.warnings];
    let blocked = false;

    const scopeConfirmation = request.scopeConfirmationId
      ? await new ScopeConfirmationStore().get(request.scopeConfirmationId)
      : null;

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
    }

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
      nextActions: nextActions(profile, steps),
    };
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

function nextActions(profile: WorkflowProfile, steps: ProfileWorkflowStep[]): string[] {
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
  return ["Review generated summary and trace.", "Proceed only within the active profile scope."];
}
