import { OpenCodeWorkflowToolService } from "../adapters/opencode/OpenCodeWorkflowToolService.ts";

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

const service = new OpenCodeWorkflowToolService();
const encoder = new TextEncoder();
let buffer = "";

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

async function handleLine(line: string): Promise<void> {
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
        respond(request.id, {
          tools: [{
            name: "run_profile_workflow",
            description: "Run AgentFlow Runtime through the active workflow profile and return formatted role timeline output.",
            inputSchema: {
              type: "object",
              properties: {
                task: { type: "string" },
                profile: { type: "string" },
                inputPath: { type: "string" },
                sessionId: { type: "string" },
                answer: { type: "string" },
                dryRun: { type: "boolean" },
                allowExecution: { type: "boolean" },
              },
              additionalProperties: false,
            },
          }],
        });
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

async function callTool(request: JsonRpcRequest): Promise<void> {
  const name = String(request.params?.name ?? "");
  if (name !== "run_profile_workflow") {
    respondError(request.id, -32602, `Unknown tool: ${name}`);
    return;
  }
  const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
  const result = await service.runProfileWorkflow(args);
  respond(request.id, {
    content: [{ type: "text", text: result.formattedText }],
    structuredContent: result,
    isError: false,
  });
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
