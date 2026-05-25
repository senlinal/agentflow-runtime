import { callAgentFlowTool } from "../../mcp/agentflow-mcp-server.ts";

export type WorkflowInterceptorCommand = {
  task?: string;
  profile?: string;
  resume?: boolean;
  answer?: string;
};

export type WorkflowToolCaller = (name: string, args: Record<string, unknown>) => Promise<unknown>;

const WORKFLOW_TOOL = "agentflow_run_profile_workflow";
const DEFAULT_PROFILE = "agent-workforce-basic";
const DEFAULT_TASK = "演示 AgentFlow 多角色协作";
const ENTRY_PREFIX_RE = /^(?:\/workflow|@?agentflow)\b/i;

export async function AgentFlowWorkflowInterceptor(input: {
  toolCaller?: WorkflowToolCaller;
} = {}) {
  const toolCaller = input.toolCaller ?? callAgentFlowTool;
  return {
    name: "agentflow-workflow-interceptor",
    async "chat.message"(
      _input: { sessionID?: string },
      output: { parts: Array<Record<string, unknown>> },
    ) {
      const text = textFromParts(output.parts);
      const parsed = parseAgentFlowEntry(text);
      if (!parsed) return;
      output.parts = [textPart(await runWorkflowEntry(toolCaller, parsed))];
    },
    async "command.execute.before"(
      commandInput: { command: string; arguments?: string },
      output: { parts: Array<Record<string, unknown>> },
    ) {
      if (commandInput.command !== "workflow") return;
      const parsed = parseWorkflowCommand(commandInput.arguments ?? "");
      output.parts = [textPart(await runWorkflowEntry(toolCaller, parsed))];
    },
  };
}

export default AgentFlowWorkflowInterceptor;

export function parseAgentFlowEntry(input: string): WorkflowInterceptorCommand | undefined {
  const text = input.trim();
  if (!ENTRY_PREFIX_RE.test(text)) return undefined;
  return parseWorkflowCommand(text.replace(ENTRY_PREFIX_RE, "").trim());
}

export function parseWorkflowCommand(input: string): WorkflowInterceptorCommand {
  const text = input.replace(ENTRY_PREFIX_RE, "").trim();
  const resumePrefix = "回答上一轮问题：";
  if (text.startsWith(resumePrefix)) {
    const answer = text.slice(resumePrefix.length).trim();
    return { profile: DEFAULT_PROFILE, resume: true, answer, task: answer };
  }

  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens[0] === "run" && tokens[1]) {
    return {
      profile: tokens[1],
      task: tokens.slice(2).join(" ").trim() || DEFAULT_TASK,
    };
  }

  return {
    profile: DEFAULT_PROFILE,
    task: text || DEFAULT_TASK,
  };
}

export function fallbackText(task: string): string {
  return [
    "AgentFlow Runtime was not started.",
    "Reason: agentflow_run_profile_workflow MCP tool is unavailable.",
    "Fallback:",
    `npm run workflow:run-profile -- --profile ${DEFAULT_PROFILE} --task "${escapeShellDoubleQuoted(task)}"`,
  ].join("\n");
}

export async function runWorkflowEntry(toolCaller: WorkflowToolCaller, parsed: WorkflowInterceptorCommand): Promise<string> {
  const task = parsed.task ?? parsed.answer ?? DEFAULT_TASK;
  try {
    const result = await toolCaller(WORKFLOW_TOOL, {
      ...(task ? { task } : {}),
      profile: parsed.profile ?? DEFAULT_PROFILE,
      ...(parsed.resume ? { resume: true } : {}),
      ...(parsed.answer ? { answer: parsed.answer } : {}),
      allowExecution: false,
      allowLLM: false,
    });
    return formattedText(result, task);
  } catch {
    return fallbackText(task);
  }
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

function textFromParts(parts: Array<Record<string, unknown>>): string {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("\n")
    .trim();
}

function escapeShellDoubleQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`");
}
