import { callAgentFlowTool } from "../../mcp/agentflow-mcp-server.ts";

export type WorkflowInterceptorCommand = {
  task?: string;
  profile?: string;
  resume?: boolean;
  answer?: string;
};

export type WorkflowToolCaller = (name: string, args: Record<string, unknown>) => Promise<unknown>;

const WORKFLOW_TOOL = "agentflow_run_profile_workflow";

export async function AgentFlowWorkflowInterceptor(input: {
  toolCaller?: WorkflowToolCaller;
} = {}) {
  const toolCaller = input.toolCaller ?? callAgentFlowTool;
  return {
    name: "agentflow-workflow-interceptor",
    async "command.execute.before"(
      commandInput: { command: string; arguments?: string },
      output: { parts: Array<Record<string, unknown>> },
    ) {
      if (commandInput.command !== "workflow") return;
      const parsed = parseWorkflowCommand(commandInput.arguments ?? "");
      try {
        const result = await toolCaller(WORKFLOW_TOOL, {
          ...(parsed.task ? { task: parsed.task } : {}),
          ...(parsed.profile ? { profile: parsed.profile } : {}),
          ...(parsed.resume ? { resume: true } : {}),
          ...(parsed.answer ? { answer: parsed.answer } : {}),
          allowExecution: false,
          allowLLM: false,
        });
        output.parts = [textPart(formattedText(result, parsed.task ?? parsed.answer ?? ""))];
      } catch {
        output.parts = [textPart(fallbackText(parsed.task ?? parsed.answer ?? ""))];
      }
    },
  };
}

export default AgentFlowWorkflowInterceptor;

export function parseWorkflowCommand(input: string): WorkflowInterceptorCommand {
  const text = input.replace(/^\/workflow\b/, "").trim();
  const resumePrefix = "回答上一轮问题：";
  if (text.startsWith(resumePrefix)) {
    const answer = text.slice(resumePrefix.length).trim();
    return { resume: true, answer, task: answer };
  }

  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens[0] === "run" && tokens[1]) {
    return {
      profile: tokens[1],
      task: tokens.slice(2).join(" ").trim() || "演示 AgentFlow 多角色协作",
    };
  }

  return {
    task: text || "演示 AgentFlow 多角色协作",
  };
}

export function fallbackText(task: string): string {
  return [
    "AgentFlow Runtime was not started.",
    "Reason: agentflow_run_profile_workflow MCP tool is unavailable.",
    "Fallback:",
    `npm run workflow:run-profile -- --task "${escapeShellDoubleQuoted(task)}"`,
  ].join("\n");
}

function formattedText(result: unknown, task: string): string {
  if (result && typeof result === "object" && "formattedText" in result) {
    const value = (result as { formattedText?: unknown }).formattedText;
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallbackText(task);
}

function textPart(text: string): Record<string, unknown> {
  return { type: "text", text };
}

function escapeShellDoubleQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`");
}
