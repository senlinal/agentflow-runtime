export type WorkflowInterceptorCommand = {
  mode?: "profile-run" | "native-pack" | "native-collect";
  task?: string;
  profile?: string;
  runId?: string;
  resume?: boolean;
  answer?: string;
  allowLLM?: boolean;
};

export type WorkflowToolCaller = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export const WORKFLOW_TOOL = "agentflow_run_profile_workflow";
export const NATIVE_PACK_TOOL = "agentflow_native_pack";
export const NATIVE_COLLECT_TOOL = "agentflow_native_collect";
export const DEFAULT_PROFILE = "agent-workforce-basic";
export const LLM_PROFILE = "agent-workforce-llm";
const DEFAULT_TASK = "演示 AgentFlow 多角色协作";
const ENTRY_PREFIX_RE = /^(?:\/workflow|@?agentflow)\b/i;

export function parseAgentFlowEntry(input: unknown): WorkflowInterceptorCommand | undefined {
  const text = stringifyInput(input).trim();
  if (!ENTRY_PREFIX_RE.test(text)) return undefined;
  return parseWorkflowCommand(text.replace(ENTRY_PREFIX_RE, "").trim());
}

export function parseWorkflowCommand(input: unknown): WorkflowInterceptorCommand {
  const rawText = stringifyInput(input).replace(ENTRY_PREFIX_RE, "").trim();
  const llmIntent = parseLLMIntent(rawText);
  const text = llmIntent.text;
  const resumePrefix = "回答上一轮问题：";
  if (text.startsWith(resumePrefix)) {
    const answer = text.slice(resumePrefix.length).trim();
    return {
      profile: llmIntent.allowLLM ? LLM_PROFILE : DEFAULT_PROFILE,
      resume: true,
      answer,
      task: answer,
      ...(llmIntent.allowLLM ? { allowLLM: true } : {}),
    };
  }

  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens[0] === "native-pack") {
    const explicitProfile = tokens[1] === "run" && tokens[2] ? tokens[2] : undefined;
    const taskTokens = explicitProfile ? tokens.slice(3) : tokens.slice(1);
    return {
      mode: "native-pack",
      profile: explicitProfile ?? DEFAULT_PROFILE,
      task: taskTokens.join(" ").trim() || DEFAULT_TASK,
    };
  }
  if (tokens[0] === "native-collect") {
    const runId = tokens[1] === "run" && tokens[2] ? tokens[2] : tokens[1];
    return {
      mode: "native-collect",
      runId,
      task: runId ?? DEFAULT_TASK,
      profile: DEFAULT_PROFILE,
    };
  }
  if (tokens[0] === "run" && tokens[1]) {
    const profile = tokens[1];
    const allowLLM = llmIntent.allowLLM || profile === LLM_PROFILE;
    return {
      profile,
      task: tokens.slice(2).join(" ").trim() || DEFAULT_TASK,
      ...(allowLLM ? { allowLLM: true } : {}),
    };
  }

  return {
    profile: llmIntent.allowLLM ? LLM_PROFILE : DEFAULT_PROFILE,
    task: text || DEFAULT_TASK,
    ...(llmIntent.allowLLM ? { allowLLM: true } : {}),
  };
}

export function fallbackText(task: string, profile = DEFAULT_PROFILE): string {
  const taskText = stringifyInput(task) || DEFAULT_TASK;
  return [
    "AgentFlow Runtime was not started.",
    "Reason: agentflow_run_profile_workflow MCP tool is unavailable.",
    "Fallback:",
    `npm run workflow:run-profile -- --profile ${profile} --task "${escapeShellDoubleQuoted(taskText)}"${profile === LLM_PROFILE ? " --allow-llm" : ""}`,
  ].join("\n");
}

export function buildToolInstruction(parsed: WorkflowInterceptorCommand = {}): string {
  const task = stringifyInput(parsed.task ?? parsed.answer ?? DEFAULT_TASK) || DEFAULT_TASK;
  const profile = parsed.profile ?? DEFAULT_PROFILE;
  if (parsed.mode === "native-pack") {
    const args = { task, profile };
    return [
      "Call MCP tool `agentflow_native_pack` now with exactly these arguments:",
      JSON.stringify(args),
      "",
      "After the tool returns, display only `formattedText` exactly as returned.",
      "Do not summarize it. Do not create a Supervisor plan. Do not search. Do not call CodeExecutor.",
      "If the MCP tool is unavailable, display this fallback exactly:",
      `AgentFlow native workflow pack was not created.\nReason: agentflow_native_pack MCP tool is unavailable.\nFallback:\nnpm run workflow:native-pack -- --profile ${profile} --task "${escapeShellDoubleQuoted(task)}"`,
    ].join("\n");
  }
  if (parsed.mode === "native-collect") {
    const runId = stringifyInput(parsed.runId ?? parsed.task ?? "").trim();
    const args = { run: runId };
    return [
      "Call MCP tool `agentflow_native_collect` now with exactly these arguments:",
      JSON.stringify(args),
      "",
      "After the tool returns, display only `formattedText` exactly as returned.",
      "Do not summarize it. Do not create a Supervisor plan. Do not search. Do not call CodeExecutor.",
      "If the MCP tool is unavailable, display this fallback exactly:",
      `AgentFlow native workflow collect was not started.\nReason: agentflow_native_collect MCP tool is unavailable.\nFallback:\nnpm run workflow:native-collect -- --run ${escapeShellDoubleQuoted(runId)}`,
    ].join("\n");
  }
  const args = {
    task,
    profile,
    ...(parsed.resume ? { resume: true } : {}),
    ...(parsed.answer ? { answer: parsed.answer } : {}),
    allowExecution: false,
    allowLLM: parsed.allowLLM === true,
  };
  return [
    "Call MCP tool `agentflow_run_profile_workflow` now with exactly these arguments:",
    JSON.stringify(args),
    "",
    "After the tool returns, display only `formattedText` exactly as returned.",
    "Do not summarize it. Do not create a Supervisor plan. Do not search. Do not call CodeExecutor.",
    "If the MCP tool is unavailable, display this fallback exactly:",
    fallbackText(task, profile),
  ].join("\n");
}

export async function runWorkflowEntry(toolCaller: WorkflowToolCaller, parsed: WorkflowInterceptorCommand = {}): Promise<string> {
  const task = stringifyInput(parsed.task ?? parsed.answer ?? DEFAULT_TASK) || DEFAULT_TASK;
  const profile = parsed.profile ?? DEFAULT_PROFILE;
  try {
    if (parsed.mode === "native-pack") {
      const result = await toolCaller(NATIVE_PACK_TOOL, { task, profile });
      return formattedText(result, task, profile);
    }
    if (parsed.mode === "native-collect") {
      const runId = stringifyInput(parsed.runId ?? task).trim();
      const result = await toolCaller(NATIVE_COLLECT_TOOL, { run: runId });
      return formattedText(result, task, profile);
    }
    const result = await toolCaller(WORKFLOW_TOOL, {
      ...(task ? { task } : {}),
      profile,
      ...(parsed.resume ? { resume: true } : {}),
      ...(parsed.answer ? { answer: parsed.answer } : {}),
      allowExecution: false,
      allowLLM: parsed.allowLLM === true,
    });
    return formattedText(result, task, profile);
  } catch {
    return fallbackText(task, profile);
  }
}

export function extractFormattedText(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      return extractFormattedText(JSON.parse(trimmed));
    } catch {
      return trimmed.includes("AgentFlow") ? trimmed : undefined;
    }
  }
  if (!isRecord(value)) return undefined;
  const formattedText = value.formattedText;
  if (typeof formattedText === "string" && formattedText.trim()) return formattedText;
  const structuredContent = value.structuredContent;
  const fromStructured = extractFormattedText(structuredContent);
  if (fromStructured) return fromStructured;
  const content = value.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      const fromPart = extractFormattedText(part);
      if (fromPart) return fromPart;
    }
  }
  const text = value.text;
  if (typeof text === "string" && text.includes("AgentFlow")) return text;
  return undefined;
}

function formattedText(result: unknown, task: string, profile: string): string {
  const value = extractFormattedText(result);
  if (value) return value;
  return fallbackText(task, profile);
}

function parseLLMIntent(input: string): { text: string; allowLLM: boolean } {
  let text = input.trim();
  let allowLLM = false;
  const flagPattern = /(?:^|\s)(--allow-llm|--allowLLM|--llm)(?=\s|$)/gi;
  if (flagPattern.test(text)) {
    allowLLM = true;
    text = text.replace(flagPattern, " ").trim();
  }
  const leadingPattern = /^(?:llm|real-llm|真实\s*llm|真实|非\s*mock|不要\s*mock|不用\s*mock|no\s*mock)\b\s*/i;
  if (leadingPattern.test(text)) {
    allowLLM = true;
    text = text.replace(leadingPattern, "").trim();
  }
  const inlinePattern = /(?:^|\s)(?:不要\s*mock|不用\s*mock|非\s*mock|真实\s*llm|no\s*mock)(?=\s|$)/i;
  if (inlinePattern.test(text)) {
    allowLLM = true;
    text = text.replace(inlinePattern, " ").trim();
  }
  return { text, allowLLM };
}

function escapeShellDoubleQuoted(value: string): string {
  return stringifyInput(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`");
}

function stringifyInput(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return value.map((item) => stringifyInput(item)).filter(Boolean).join(" ");
  if (isRecord(value)) {
    const args = value.arguments ?? value.args ?? value.task ?? value.text ?? value.content;
    if (args !== undefined) return stringifyInput(args);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
