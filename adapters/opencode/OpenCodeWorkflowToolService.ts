import { TemplateCreateService } from "../../core/TemplateCreateService.ts";
import { ProfileWorkflowRunner, type ProfileWorkflowRunRequest, type ProfileWorkflowRunResult } from "../../core/profile/ProfileWorkflowRunner.ts";
import { TaskBriefLoader } from "../../core/TaskBriefLoader.ts";
import { WorkflowRunner } from "../../core/WorkflowRunner.ts";
import { WorkflowTemplateRegistry } from "../../core/WorkflowTemplateRegistry.ts";
import type { TaskBrief } from "../../core/types.ts";

export type RunWorkflowToolInput = {
  template: string;
  inputPath?: string;
  taskBrief?: Partial<TaskBrief> & Record<string, unknown>;
};

export type RunWorkflowToolResult = {
  runId: string;
  finalStatus: "passed" | "stopped" | "not-passed";
  feasibilityDecision: string | null;
  costLevel: string | null;
  riskLevel: string | null;
  enteredExecutor: boolean;
  verificationPass: boolean | null;
  verificationScore: number | null;
  summaryPath: string;
  tracePath: string;
  contextPath: string;
};

export type CreateWorkflowToolInput = {
  specPath: string;
  outPath: string;
  name?: string;
  description?: string;
  version?: string;
  force?: boolean;
};

export class OpenCodeWorkflowToolService {
  private readonly registry: WorkflowTemplateRegistry;

  constructor(registry = new WorkflowTemplateRegistry()) {
    this.registry = registry;
  }

  async runWorkflow(input: RunWorkflowToolInput): Promise<RunWorkflowToolResult> {
    if (!input.template) throw new Error("run_workflow requires template.");
    if (!input.inputPath && !input.taskBrief) {
      throw new Error("run_workflow requires either inputPath or taskBrief.");
    }

    const taskBrief = input.inputPath
      ? await TaskBriefLoader.loadJson(input.inputPath)
      : TaskBriefLoader.fromObject(input.taskBrief, "opencode-taskBrief");

    const { config } = await this.registry.load(input.template);
    const result = await new WorkflowRunner().run(config, taskBrief);
    const context = result.context;
    const finalStatus = context.stopReason ? "stopped" : context.verification?.pass ? "passed" : "not-passed";
    const enteredExecutor = context.trace.some((item) =>
      item.role === "Executor" || item.role === "CodeExecutor" || item.role === "TestRunner" || item.nodeId === "executor"
    );

    return {
      runId: result.runId,
      finalStatus,
      feasibilityDecision: context.feasibilityReport?.decision ?? null,
      costLevel: context.feasibilityReport?.costLevel ?? null,
      riskLevel: context.feasibilityReport?.riskLevel ?? null,
      enteredExecutor,
      verificationPass: context.verification?.pass ?? null,
      verificationScore: context.verification?.score ?? null,
      summaryPath: result.summaryPath,
      tracePath: result.tracePath,
      contextPath: result.contextPath,
    };
  }

  async runProfileWorkflow(input: ProfileWorkflowRunRequest): Promise<ProfileWorkflowRunResult> {
    if (!input.task && !input.inputPath) {
      throw new Error("run_profile_workflow requires task or inputPath.");
    }
    return new ProfileWorkflowRunner().run({
      ...input,
      allowExecution: input.allowExecution === true,
    });
  }

  async listWorkflows(_input: { includeDetails?: boolean } = {}): Promise<{
    workflows: Array<{ name: string; version: string; description: string; sourcePath: string; duplicate: boolean }>;
  }> {
    const workflows = await this.registry.listTemplates();
    return {
      workflows: workflows.map((item) => ({
        name: item.name,
        version: item.version,
        description: item.description,
        sourcePath: item.sourcePath,
        duplicate: item.duplicate,
      })),
    };
  }

  async inspectWorkflow(input: { template: string }): Promise<{
    name: string;
    version: string | null;
    description: string;
    sourcePath: string;
    start: string;
    maxIterations: number;
    nodes: unknown[];
    edges: unknown[];
    policies: unknown;
  }> {
    if (!input.template) throw new Error("inspect_workflow requires template.");
    const { config, sourcePath } = await this.registry.load(input.template);
    return {
      name: config.workflow.name,
      version: config.workflow.version ?? null,
      description: config.workflow.description ?? "",
      sourcePath,
      start: config.workflow.start,
      maxIterations: config.workflow.maxIterations,
      nodes: config.nodes,
      edges: config.edges,
      policies: config.defaultPolicies ?? null,
    };
  }

  async validateWorkflow(input: { template: string }): Promise<{ valid: boolean; errors: string[]; sourcePath: string | null }> {
    if (!input.template) return { valid: false, errors: ["validate_workflow requires template."], sourcePath: null };
    try {
      const { sourcePath } = await this.registry.load(input.template);
      return { valid: true, errors: [], sourcePath };
    } catch (error) {
      return { valid: false, errors: [errorMessage(error)], sourcePath: null };
    }
  }

  async createWorkflow(input: CreateWorkflowToolInput): Promise<{
    created: boolean;
    error: string | null;
    createdPath: string | null;
    name: string | null;
    version: string | null;
    nodeCount: number;
    edgeCount: number;
  }> {
    try {
      const result = await new TemplateCreateService().create({
        specPath: input.specPath,
        outPath: input.outPath,
        name: input.name,
        description: input.description,
        version: input.version,
        force: input.force,
      });
      return {
        created: true,
        error: null,
        createdPath: result.out,
        name: result.name,
        version: result.version,
        nodeCount: result.nodes,
        edgeCount: result.edges,
      };
    } catch (error) {
      return {
        created: false,
        error: errorMessage(error),
        createdPath: null,
        name: null,
        version: null,
        nodeCount: 0,
        edgeCount: 0,
      };
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
