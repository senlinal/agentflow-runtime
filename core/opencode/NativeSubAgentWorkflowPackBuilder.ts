import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { agentFlowPath } from "../AgentFlowPaths.ts";
import type { AgentNode, AgentRole, NativeSubAgentTask, NativeSubAgentWorkflowPack, TaskBrief } from "../types.ts";
import { ProfileTaskInputBuilder } from "../profile/ProfileTaskInputBuilder.ts";
import { WorkflowProfileLoader } from "../profile/WorkflowProfileLoader.ts";
import { WorkflowTemplateRegistry } from "../WorkflowTemplateRegistry.ts";

export type NativeSubAgentWorkflowPackRequest = {
  profileId: string;
  task: string;
  baseRunDir?: string;
};

export class NativeSubAgentWorkflowPackBuilder {
  private readonly profileLoader: WorkflowProfileLoader;
  private readonly workflowRegistry: WorkflowTemplateRegistry;
  private readonly taskInputBuilder: ProfileTaskInputBuilder;
  private readonly mappingPath: string;

  constructor(
    profileLoader = new WorkflowProfileLoader(),
    workflowRegistry = new WorkflowTemplateRegistry(),
    taskInputBuilder = new ProfileTaskInputBuilder(),
    mappingPath = agentFlowPath("config/opencode-subagents.json"),
  ) {
    this.profileLoader = profileLoader;
    this.workflowRegistry = workflowRegistry;
    this.taskInputBuilder = taskInputBuilder;
    this.mappingPath = mappingPath;
  }

  async build(request: NativeSubAgentWorkflowPackRequest): Promise<NativeSubAgentWorkflowPack> {
    const { profile } = await this.profileLoader.loadProfile(request.profileId);
    const { config } = await this.workflowRegistry.load(profile.defaultWorkflow);
    const taskBrief = this.taskInputBuilder.build({ profile, task: request.task });
    const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
    const artifactRoot = join(request.baseRunDir ?? agentFlowPath(".workflow-runs"), runId, "native-subagents");
    await mkdir(artifactRoot, { recursive: true });

    const mapping = await this.loadMapping();
    const selectedNodes = config.nodes.filter(isNativeWorkflowPackNode);
    const tasks: NativeSubAgentTask[] = [];
    for (const node of selectedNodes) {
      const slug = roleSlug(node.role);
      const dir = join(artifactRoot, slug);
      await mkdir(dir, { recursive: true });
      const taskId = `${runId}-${slug}`;
      const openCodeAgentName = mapping[node.role] ?? toDefaultAgentName(node.role);
      const inputArtifactPath = join(dir, "input.json");
      const promptPath = join(dir, "prompt.md");
      const outputArtifactPath = join(dir, "output.json");
      const schemaPath = join(dir, "output.schema.json");
      const dependencies = dependenciesFor(node, selectedNodes);
      const nativeTask: NativeSubAgentTask = {
        taskId,
        runId,
        role: node.role,
        openCodeAgentName,
        title: `${node.role} task for ${request.task}`,
        promptPath,
        inputArtifactPath,
        outputArtifactPath,
        expectedOutputSchema: node.outputSchema,
        dependencies,
        status: dependencies.length === 0 ? "ready" : "pending",
        instructions: buildInstructions(node, openCodeAgentName, inputArtifactPath, outputArtifactPath, schemaPath),
        createdAt: new Date().toISOString(),
      };
      await writeFile(inputArtifactPath, `${JSON.stringify(buildInput(node, taskBrief, dependencies, tasks), null, 2)}\n`, "utf8");
      await writeFile(promptPath, `${nativeTask.instructions}\n`, "utf8");
      await writeFile(schemaPath, `${JSON.stringify(buildSchemaStub(node), null, 2)}\n`, "utf8");
      tasks.push(nativeTask);
    }

    const dispatchInstructionsPath = join(artifactRoot, "DISPATCH.md");
    const manifestPath = join(artifactRoot, "manifest.json");
    const pack: NativeSubAgentWorkflowPack = {
      runId,
      task: request.task,
      profileId: profile.id,
      tasks,
      artifactRoot,
      dispatchInstructionsPath,
      manifestPath,
      status: "created",
      createdAt: new Date().toISOString(),
    };
    await writeFile(dispatchInstructionsPath, buildDispatchMarkdown(pack), "utf8");
    await writeFile(manifestPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
    return pack;
  }

  private async loadMapping(): Promise<Partial<Record<AgentRole, string>>> {
    return JSON.parse(await readFile(this.mappingPath, "utf8")) as Partial<Record<AgentRole, string>>;
  }
}

function isNativeWorkflowPackNode(node: AgentNode): boolean {
  return ["Planner", "Debater", "PlannerRevision", "Executor", "Verifier"].includes(node.role);
}

function dependenciesFor(node: AgentNode, nodes: AgentNode[]): string[] {
  const roles = nodes.map((item) => item.role);
  if (node.role === "Planner") return [];
  if (node.role === "Debater") return roleIds(["Planner"], roles);
  if (node.role === "PlannerRevision") return roleIds(["Planner", "Debater"], roles);
  if (node.role === "Executor") return roleIds(["PlannerRevision"], roles);
  if (node.role === "Verifier") return roleIds(["Executor"], roles);
  return [];
}

function roleIds(roles: string[], available: string[]): string[] {
  return roles.filter((role) => available.includes(role)).map(roleSlug);
}

function buildInput(node: AgentNode, taskBrief: TaskBrief, dependencies: string[], priorTasks: NativeSubAgentTask[]): Record<string, unknown> {
  return {
    taskBrief,
    role: node.role,
    nodeId: node.id,
    inputKeys: node.inputKeys,
    outputKey: node.outputKey,
    expectedOutputSchema: node.outputSchema,
    dependencies: dependencies.map((dependency) => {
      const task = priorTasks.find((item) => item.taskId.endsWith(`-${dependency}`));
      return {
        role: dependency,
        outputArtifactPath: task?.outputArtifactPath ?? null,
      };
    }),
    constraints: [
      "Only complete your assigned role.",
      "Write only the requested output.json artifact.",
      "Do not delete files.",
      "Do not modify unrelated files.",
      "Do not read .env or secrets.",
      "Do not call real LLM providers unless OpenCode explicitly does so as part of its native subagent run.",
    ],
  };
}

function buildInstructions(
  node: AgentNode,
  openCodeAgentName: string,
  inputArtifactPath: string,
  outputArtifactPath: string,
  schemaPath: string,
): string {
  return [
    `You are @${openCodeAgentName}, the AgentFlow ${node.role} native subagent.`,
    "",
    "Only complete this role's task. Do not perform other AgentFlow roles.",
    `Read input from: ${inputArtifactPath}`,
    `Write output JSON to: ${outputArtifactPath}`,
    `Follow schema reference: ${schemaPath}`,
    `Expected schema: ${node.outputSchema}`,
    "",
    "Rules:",
    "- Write exactly one output artifact at the requested output path.",
    "- The output must be valid JSON and match the expected schema.",
    "- Do not delete files.",
    "- Do not modify unrelated files.",
    "- Do not read .env or secrets.",
    "- If you cannot write output.json, explain the reason in the OpenCode subagent response.",
  ].join("\n");
}

function buildSchemaStub(node: AgentNode): Record<string, unknown> {
  return {
    schemaName: node.outputSchema,
    note: "AgentFlow validates this output with SchemaValidator by schemaName during workflow:native-collect.",
    outputPathMustExist: true,
  };
}

function buildDispatchMarkdown(pack: NativeSubAgentWorkflowPack): string {
  return [
    "# AgentFlow OpenCode Native Subagent Dispatch Pack",
    "",
    `Task: ${pack.task}`,
    `Profile: ${pack.profileId}`,
    `Run: ${pack.runId}`,
    "",
    "Create these OpenCode native subagent tasks in order:",
    "",
    ...pack.tasks.flatMap((task, index) => [
      `${index + 1}. @${task.openCodeAgentName} - ${task.role}`,
      `   - Read: ${task.inputArtifactPath}`,
      `   - Prompt: ${task.promptPath}`,
      `   - Write: ${task.outputArtifactPath}`,
      `   - Schema: ${task.expectedOutputSchema}`,
      `   - Dependencies: ${task.dependencies.join(", ") || "none"}`,
    ]),
    "",
    "After all required output.json files exist, collect and verify:",
    "",
    "```bash",
    `npm run workflow:native-collect -- --run ${pack.runId}`,
    "```",
    "",
    "Do not mark a native subagent completed unless its output.json exists and validates.",
  ].join("\n");
}

function roleSlug(role: string): string {
  return role.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function toDefaultAgentName(role: string): string {
  return `agentflow-${roleSlug(role)}`;
}

export function manifestPathForRun(runId: string, baseRunDir = agentFlowPath(".workflow-runs")): string {
  return join(baseRunDir, runId, "native-subagents", "manifest.json");
}

export function displayTask(task: NativeSubAgentTask): string {
  return `${task.role}: @${task.openCodeAgentName} (${basename(task.inputArtifactPath)} -> ${basename(task.outputArtifactPath)})`;
}
