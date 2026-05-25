import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { agentFlowPath } from "../AgentFlowPaths.ts";
import type { AgentRole, OpenCodeSubAgentDispatchResult } from "../types.ts";

export type OpenCodeSubAgentBridgeInput = {
  runId: string;
  runDir: string;
  nodeId: string;
  role: AgentRole;
  inputKeys: string[];
  outputKey: string;
  outputSchema?: string;
  contextPacket?: unknown;
  profileId?: string;
};

export type OpenCodeSubAgentConfigStatus = {
  mappingPath: string;
  configuredAgents: Array<{
    role: AgentRole;
    openCodeAgentName: string;
    configPath: string;
    exists: boolean;
  }>;
  programmaticDispatchSupported: false;
  canReadTaskId: false;
  canReadSessionId: false;
  limitations: string[];
};

const DEFAULT_LIMITATION = "Current OpenCode 1.15 plugin/MCP APIs expose custom subagent definitions and manual @agent invocation, but do not expose a documented programmatic subagent dispatch API or task/session id reader.";

export class OpenCodeSubAgentBridge {
  private readonly mappingPath: string;
  private readonly agentsDir: string;

  constructor(
    mappingPath = agentFlowPath("config/opencode-subagents.json"),
    agentsDir = agentFlowPath(".opencode/agents"),
  ) {
    this.mappingPath = mappingPath;
    this.agentsDir = agentsDir;
  }

  async dispatch(input: OpenCodeSubAgentBridgeInput): Promise<OpenCodeSubAgentDispatchResult> {
    const mapping = await this.loadMapping();
    const openCodeAgentName = mapping[input.role] ?? toDefaultAgentName(input.role);
    const dispatchId = `opencode-native-${input.nodeId}-${randomUUID().slice(0, 8)}`;
    const dir = join(input.runDir, "opencode-native", dispatchId);
    await mkdir(dir, { recursive: true });
    const inputPromptPath = join(dir, "prompt.md");
    await writeFile(inputPromptPath, buildPrompt(input, openCodeAgentName), "utf8");
    return {
      dispatchId,
      role: input.role,
      nodeId: input.nodeId,
      openCodeAgentName,
      status: "unavailable",
      inputPromptPath,
      limitations: [DEFAULT_LIMITATION],
      createdAt: new Date().toISOString(),
    };
  }

  async inspectConfig(): Promise<OpenCodeSubAgentConfigStatus> {
    const mapping = await this.loadMapping();
    const configuredAgents = await Promise.all(Object.entries(mapping).map(async ([role, openCodeAgentName]) => {
      const configPath = join(this.agentsDir, `${openCodeAgentName}.md`);
      return {
        role: role as AgentRole,
        openCodeAgentName,
        configPath,
        exists: await exists(configPath),
      };
    }));
    return {
      mappingPath: this.mappingPath,
      configuredAgents,
      programmaticDispatchSupported: false,
      canReadTaskId: false,
      canReadSessionId: false,
      limitations: [
        DEFAULT_LIMITATION,
        "The bridge therefore records an unavailable native-dispatch proof instead of fabricating openCodeTaskId or openCodeSessionId.",
      ],
    };
  }

  private async loadMapping(): Promise<Partial<Record<AgentRole, string>>> {
    const raw = await readFile(this.mappingPath, "utf8");
    return JSON.parse(raw) as Partial<Record<AgentRole, string>>;
  }
}

function buildPrompt(input: OpenCodeSubAgentBridgeInput, openCodeAgentName: string): string {
  return [
    `# AgentFlow -> OpenCode Native Subagent Dispatch Request`,
    "",
    `OpenCode agent: @${openCodeAgentName}`,
    `role: ${input.role}`,
    `nodeId: ${input.nodeId}`,
    `runId: ${input.runId}`,
    ...(input.profileId ? [`profileId: ${input.profileId}`] : []),
    `inputKeys: ${input.inputKeys.join(", ") || "none"}`,
    `outputKey: ${input.outputKey}`,
    `outputSchema: ${input.outputSchema ?? "n/a"}`,
    "",
    "## Context Packet",
    "",
    JSON.stringify(input.contextPacket ?? {}, null, 2),
    "",
    "## Limitation",
    "",
    DEFAULT_LIMITATION,
  ].join("\n");
}

function toDefaultAgentName(role: AgentRole): string {
  return `agentflow-${role.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
