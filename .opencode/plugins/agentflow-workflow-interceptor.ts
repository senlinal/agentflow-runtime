import {
  buildToolInstruction,
  DEFAULT_PROFILE,
  extractFormattedText,
  LLM_PROFILE,
  NATIVE_COLLECT_TOOL,
  NATIVE_PACK_TOOL,
  parseAgentFlowEntry,
  parseWorkflowCommand,
  type WorkflowToolCaller,
  WORKFLOW_TOOL,
} from "../../adapters/opencode/AgentFlowWorkflowInterceptorCore.ts";

const COMMANDS = new Set(["workflow", "agentflow", "workflow-llm", "agentflow-llm"]);
const LLM_COMMANDS = new Set(["workflow-llm", "agentflow-llm"]);
const AGENTFLOW_WORKFLOW_TOOL_NAME = "agentflow_run_profile_workflow";
const latestFormattedTextBySession = new Map<string, string>();

export async function AgentFlowWorkflowInterceptor(input: {
  toolCaller?: WorkflowToolCaller;
} = {}) {
  void input;
  return {
    name: "agentflow-workflow-interceptor",
    async config() {},
    async "chat.message"(
      _input: { sessionID?: string } = {},
      output: { parts?: Array<Record<string, unknown>> } = {},
    ) {
      const text = textFromParts(output.parts ?? []);
      const parsed = parseAgentFlowEntry(text);
      if (!parsed) return;
      output.parts = [textPart(buildToolInstruction(parsed))];
    },
    async "command.execute.before"(
      commandInput: { command?: string; sessionID?: string; arguments?: unknown } = {},
      output: { parts?: Array<Record<string, unknown>> } = {},
    ) {
      if (typeof commandInput.command !== "string") return;
      if (!COMMANDS.has(commandInput.command)) return;
      const parsed = parseWorkflowCommand(commandInput.arguments ?? "");
      if (LLM_COMMANDS.has(commandInput.command)) {
        parsed.profile = LLM_PROFILE;
        parsed.allowLLM = true;
      } else {
        parsed.profile = DEFAULT_PROFILE;
        parsed.allowLLM = false;
      }
      output.parts = [textPart(buildToolInstruction(parsed))];
    },
    async "tool.execute.after"(
      input: { tool?: string; sessionID?: string } = {},
      output: { output?: string; metadata?: unknown } = {},
    ) {
      if (!input.tool) return;
      if (!isAgentFlowWorkflowTool(input.tool)) return;
      const formatted = extractFormattedText(output.metadata) ?? extractFormattedText(output.output);
      if (formatted) rememberFormattedText(input.sessionID, formatted);
    },
    async "experimental.text.complete"(
      input: { sessionID?: string } = {},
      output: { text?: string } = {},
    ) {
      const formatted = input.sessionID ? latestFormattedTextBySession.get(input.sessionID) : undefined;
      if (!formatted) return;
      output.text = formatted;
      latestFormattedTextBySession.delete(input.sessionID);
    },
  };
}

function rememberFormattedText(sessionID: string | undefined, formattedText: string): void {
  if (!sessionID || !formattedText.includes("AgentFlow")) return;
  latestFormattedTextBySession.set(sessionID, formattedText);
}

function isAgentFlowWorkflowTool(tool: string): boolean {
  return tool === WORKFLOW_TOOL
    || tool.endsWith(`_${WORKFLOW_TOOL}`)
    || tool === "run_profile_workflow"
    || tool.endsWith("_run_profile_workflow")
    || tool === NATIVE_PACK_TOOL
    || tool.endsWith(`_${NATIVE_PACK_TOOL}`)
    || tool === NATIVE_COLLECT_TOOL
    || tool.endsWith(`_${NATIVE_COLLECT_TOOL}`);
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
