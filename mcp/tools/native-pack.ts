import { NativeSubAgentWorkflowPackBuilder } from "../../core/opencode/NativeSubAgentWorkflowPackBuilder.ts";

export type AgentFlowNativePackInput = {
  task?: string;
  profile?: string;
};

export type AgentFlowNativePackOutput = {
  formattedText: string;
  runId: string;
  dispatchInstructionsPath: string;
  manifestPath?: string;
  taskCount: number;
  tasks: Array<{
    role: string;
    openCodeAgentName: string;
    promptPath: string;
    inputArtifactPath: string;
    outputArtifactPath: string;
    expectedOutputSchema: string;
    dependencies: string[];
  }>;
  dispatchPrompt: string;
};

export async function agentflowNativePack(input: AgentFlowNativePackInput): Promise<AgentFlowNativePackOutput> {
  const task = input.task?.trim() || "演示 AgentFlow OpenCode native subagents";
  const profile = input.profile?.trim() || "agent-workforce-basic";
  const pack = await new NativeSubAgentWorkflowPackBuilder().build({ profileId: profile, task });
  const dispatchPrompt = buildDispatchPrompt(pack.runId, pack.dispatchInstructionsPath, pack.tasks);
  return {
    formattedText: [
      "AgentFlow Native Workflow Pack 已生成",
      "",
      `Profile: ${pack.profileId}`,
      `runId: ${pack.runId}`,
      `dispatchInstructionsPath: ${pack.dispatchInstructionsPath}`,
      `manifestPath: ${pack.manifestPath ?? "n/a"}`,
      `tasks: ${pack.tasks.length}`,
      "",
      "OpenCode 派工 prompt（复制/发送给 OpenCode，让它创建 native subagent tasks）：",
      "",
      "```text",
      dispatchPrompt,
      "```",
      "",
      "完成后收集：",
      `/agentflow native-collect ${pack.runId}`,
    ].join("\n"),
    runId: pack.runId,
    dispatchInstructionsPath: pack.dispatchInstructionsPath,
    manifestPath: pack.manifestPath,
    taskCount: pack.tasks.length,
    tasks: pack.tasks.map((item) => ({
      role: item.role,
      openCodeAgentName: item.openCodeAgentName,
      promptPath: item.promptPath,
      inputArtifactPath: item.inputArtifactPath,
      outputArtifactPath: item.outputArtifactPath,
      expectedOutputSchema: item.expectedOutputSchema,
      dependencies: item.dependencies,
    })),
    dispatchPrompt,
  };
}

function buildDispatchPrompt(
  runId: string,
  dispatchInstructionsPath: string,
  tasks: Array<{
    role: string;
    openCodeAgentName: string;
    promptPath: string;
    inputArtifactPath: string;
    outputArtifactPath: string;
    expectedOutputSchema: string;
    dependencies: string[];
  }>,
): string {
  return [
    "请使用 OpenCode native subagent 功能按顺序创建以下任务。",
    "不要由主 agent 自己完成角色工作；每个角色必须交给对应 @agentflow-* subagent。",
    `读取总派工说明：${dispatchInstructionsPath}`,
    `runId: ${runId}`,
    "",
    ...tasks.flatMap((task, index) => [
      `${index + 1}. 调用 @${task.openCodeAgentName}`,
      `   角色: ${task.role}`,
      `   读取 input: ${task.inputArtifactPath}`,
      `   读取 prompt: ${task.promptPath}`,
      `   写入 output: ${task.outputArtifactPath}`,
      `   schema: ${task.expectedOutputSchema}`,
      `   dependencies: ${task.dependencies.join(", ") || "none"}`,
      "   要求: 只完成自己的角色；只写指定 output.json；不要删除文件；不要修改无关文件。",
    ]),
    "",
    `全部 output.json 写完后，运行 /agentflow native-collect ${runId}`,
  ].join("\n");
}
