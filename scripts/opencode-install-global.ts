import { mkdir, readFile, writeFile, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { agentFlowRoot } from "../core/AgentFlowPaths.ts";

type OpenCodeConfig = {
  $schema?: string;
  plugin?: Array<string | [string, Record<string, unknown>]>;
  command?: Record<string, unknown>;
  mcp?: Record<string, unknown>;
  permission?: Record<string, unknown>;
};

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const root = agentFlowRoot();
const configDir = resolve(process.env.OPENCODE_CONFIG_DIR || join(homedir(), ".config", "opencode"));
const configPath = join(configDir, "opencode.json");
const commandDir = join(configDir, "commands");
const agentsDir = join(configDir, "agents");
const basicAgentFlowCommandTemplate = "Call only MCP tool `agentflow_run_profile_workflow` now with task `$ARGUMENTS`, profile `agent-workforce-basic`, allowExecution=false, allowLLM=false. Do not call agentflow_list_profiles. Do not read summaryPath or tracePath. After the tool returns, display only the tool result field `formattedText` exactly as returned. Do not summarize it. Do not create a Supervisor plan. Do not search. Do not call CodeExecutor.";
const llmAgentFlowCommandTemplate = "Call only MCP tool `agentflow_run_profile_workflow` now with task `$ARGUMENTS`, profile `agent-workforce-llm`, allowExecution=false, allowLLM=true. Do not call agentflow_list_profiles. Do not read summaryPath or tracePath. After the tool returns, display only the tool result field `formattedText` exactly as returned. Do not summarize it. Do not create a Supervisor plan. Do not search. Do not call CodeExecutor.";

const nextConfig = await buildConfig(configPath);
const writes = [
  configPath,
  `${agentsDir}/agentflow-*.md`,
];

if (dryRun) {
  console.log(`AgentFlow root: ${root}`);
  console.log(`OpenCode config dir: ${configDir}`);
  console.log(`Would write:\n- ${writes.join("\n- ")}`);
  console.log(JSON.stringify(nextConfig, null, 2));
  process.exit(0);
}

await mkdir(configDir, { recursive: true });
await mkdir(commandDir, { recursive: true });
await mkdir(agentsDir, { recursive: true });
await writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
await rm(join(commandDir, "workflow.md"), { force: true });
await cp(join(root, ".opencode", "agents"), agentsDir, { recursive: true, force: true });

console.log(`Installed AgentFlow OpenCode integration to ${configDir}`);
console.log(`AgentFlow root: ${root}`);
console.log("Restart OpenCode, then use: /workflow <task>. For real LLM, use: /workflow-llm <task>.");

async function buildConfig(path: string): Promise<OpenCodeConfig> {
  const existing = await readJson(path);
  const permission = {
    ...(existing.permission ?? {}),
    task: {
      ...taskPermission(existing.permission?.task),
      "agentflow-*": "allow",
    },
  };
  return {
    $schema: existing.$schema ?? "https://opencode.ai/config.json",
    ...existing,
    plugin: mergePlugins(existing.plugin,
      join(root, ".opencode", "plugins", "agentflow-policy.ts"),
      join(root, ".opencode", "plugins", "agentflow-workflow-interceptor.ts"),
    ),
    command: withAgentFlowCommands(existing.command),
    mcp: {
      ...(existing.mcp ?? {}),
      agentflow: {
        type: "local",
        command: [
          "env",
          `AGENTFLOW_PROJECT_ROOT=${root}`,
          "node",
          "--experimental-strip-types",
          join(root, "mcp", "agentflow-mcp-server.ts"),
        ],
        enabled: true,
      },
    },
    permission,
  };
}

async function readJson(path: string): Promise<OpenCodeConfig> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(await readFile(path, "utf8")) as OpenCodeConfig;
  } catch (error) {
    throw new Error(`Cannot parse OpenCode config at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function taskPermission(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return { "*": "deny" };
}

function mergePlugins(existing: OpenCodeConfig["plugin"], policyPlugin: string, workflowPlugin: string): OpenCodeConfig["plugin"] {
  const existingItems = Array.isArray(existing) ? existing : [];
  const requiredSet = new Set([policyPlugin, workflowPlugin]);
  const remaining = existingItems.filter((item) => {
    const id = Array.isArray(item) ? item[0] : item;
    return !requiredSet.has(id) && id !== "oh-my-openagent@latest" && !String(id).includes("agentflow-workflow-interceptor-core");
  });
  return [policyPlugin, ...remaining, workflowPlugin];
}

function withAgentFlowCommands(existing: OpenCodeConfig["command"]): OpenCodeConfig["command"] {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  return {
    ...base,
    workflow: {
      template: basicAgentFlowCommandTemplate,
      description: "Run AgentFlow workflow through the AgentFlow MCP tool",
      subtask: false,
    },
    agentflow: {
      template: basicAgentFlowCommandTemplate,
      description: "Run AgentFlow workflow through the AgentFlow MCP tool",
      subtask: false,
    },
    "workflow-llm": {
      template: llmAgentFlowCommandTemplate,
      description: "Run real LLM-backed AgentFlow workflow through the AgentFlow MCP tool",
      subtask: false,
    },
    "agentflow-llm": {
      template: llmAgentFlowCommandTemplate,
      description: "Run real LLM-backed AgentFlow workflow through the AgentFlow MCP tool",
      subtask: false,
    },
  };
}
