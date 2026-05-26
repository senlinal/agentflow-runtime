import {
  agentflowInspectProfile,
  agentflowListProfiles,
  agentflowNativeCollect,
  agentflowNativePack,
  agentflowRunProfileWorkflow,
  agentflowShowLastRun,
} from "./tools/index.ts";
import { loadDotenv } from "../core/EnvLoader.ts";

loadDotenv();

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const encoder = new TextEncoder();
let buffer = "";

const tools: ToolDefinition[] = [
  {
    name: "agentflow_native_pack",
    description: "Create an OpenCode native subagent workflow pack with dispatch prompt and artifacts.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string" },
        profile: { type: "string" },
      },
      required: ["task"],
      additionalProperties: false,
    },
  },
  {
    name: "agentflow_native_collect",
    description: "Collect and validate OpenCode native subagent workflow pack output artifacts.",
    inputSchema: {
      type: "object",
      properties: {
        run: { type: "string" },
        runId: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "agentflow_run_profile_workflow",
    description: "Run AgentFlow Runtime through a workflow profile and return verified formatted role timeline output.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string" },
        profile: { type: "string" },
        inputPath: { type: "string" },
        resume: { type: "boolean" },
        sessionId: { type: "string" },
        answer: { type: "string" },
        allowExecution: { type: "boolean", default: false },
        allowLLM: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
  },
  {
    name: "agentflow_list_profiles",
    description: "List AgentFlow workflow profiles.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "agentflow_inspect_profile",
    description: "Inspect an AgentFlow workflow profile by id.",
    inputSchema: {
      type: "object",
      properties: { profile: { type: "string" } },
      required: ["profile"],
      additionalProperties: false,
    },
  },
  {
    name: "agentflow_show_last_run",
    description: "Show the latest AgentFlow workflow run artifacts.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "run_profile_workflow",
    description: "Compatibility alias for agentflow_run_profile_workflow.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string" },
        profile: { type: "string" },
        inputPath: { type: "string" },
        resume: { type: "boolean" },
        sessionId: { type: "string" },
        answer: { type: "string" },
        allowExecution: { type: "boolean", default: false },
        allowLLM: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
  },
];

if (isMain()) {
  startAgentFlowMcpServer();
}

export function startAgentFlowMcpServer(): void {
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) void handleLine(line);
      newline = buffer.indexOf("\n");
    }
  });
}

export async function handleLine(line: string): Promise<void> {
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(line) as JsonRpcRequest;
  } catch {
    return;
  }

  if (request.id === undefined || request.id === null) return;

  try {
    switch (request.method) {
      case "initialize":
        respond(request.id, {
          protocolVersion: String(request.params?.protocolVersion ?? "2024-11-05"),
          capabilities: { tools: {} },
          serverInfo: { name: "agentflow-runtime", version: "0.1.0" },
        });
        return;
      case "tools/list":
        respond(request.id, { tools });
        return;
      case "tools/call":
        await callTool(request);
        return;
      default:
        respondError(request.id, -32601, `Unknown method: ${request.method ?? "missing"}`);
    }
  } catch (error) {
    respondError(request.id, -32000, error instanceof Error ? error.message : String(error));
  }
}

export async function callAgentFlowTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  switch (name) {
    case "agentflow_run_profile_workflow":
    case "run_profile_workflow":
      return agentflowRunProfileWorkflow(args);
    case "agentflow_native_pack":
      return agentflowNativePack(args);
    case "agentflow_native_collect":
      return agentflowNativeCollect(args);
    case "agentflow_list_profiles":
      return agentflowListProfiles();
    case "agentflow_inspect_profile":
      return agentflowInspectProfile(args);
    case "agentflow_show_last_run":
      return agentflowShowLastRun();
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function callTool(request: JsonRpcRequest): Promise<void> {
  const name = String(request.params?.name ?? "");
  const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
  const result = await callAgentFlowTool(name, args);
  respond(request.id, {
    content: [{ type: "text", text: formattedText(result) }],
    structuredContent: result,
    isError: false,
  });
}

function formattedText(result: unknown): string {
  if (result && typeof result === "object" && "formattedText" in result) {
    const text = (result as { formattedText?: unknown }).formattedText;
    if (typeof text === "string") return text;
  }
  return JSON.stringify(result, null, 2);
}

function respond(id: string | number | null | undefined, result: unknown): void {
  write({ jsonrpc: "2.0", id, result });
}

function respondError(id: string | number | null | undefined, code: number, message: string): void {
  write({ jsonrpc: "2.0", id, error: { code, message } });
}

function write(message: unknown): void {
  process.stdout.write(encoder.encode(`${JSON.stringify(message)}\n`));
}

function isMain(): boolean {
  return process.argv[1]?.endsWith("agentflow-mcp-server.ts") === true;
}
