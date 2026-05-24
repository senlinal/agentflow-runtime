import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { agentFlowRoot } from "../core/AgentFlowPaths.ts";

type OpenCodeConfig = {
  $schema?: string;
  plugin?: Array<string | [string, Record<string, unknown>]>;
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

const nextConfig = await buildConfig(configPath);
const writes = [
  configPath,
  join(commandDir, "workflow.md"),
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
await writeFile(join(commandDir, "workflow.md"), globalWorkflowCommand(root), "utf8");
await cp(join(root, ".opencode", "agents"), agentsDir, { recursive: true, force: true });

console.log(`Installed AgentFlow OpenCode integration to ${configDir}`);
console.log(`AgentFlow root: ${root}`);
console.log("Restart OpenCode, then /workflow is available from any workspace.");

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
    plugin: mergePlugins(existing.plugin, [
      join(root, ".opencode", "plugins", "agentflow-policy.ts"),
      join(root, ".opencode", "plugins", "agentflow-workflow-interceptor.ts"),
    ]),
    command: {
      ...(existing as { command?: Record<string, unknown> }).command,
      workflow: {
        description: "Run AgentFlow runtime workflow with verified role timeline",
        template: workflowTemplate(root),
      },
    },
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

function globalWorkflowCommand(agentFlowRootPath: string): string {
  const command = [
    "---",
    "description: Run AgentFlow runtime workflow with verified role timeline",
    "---",
    workflowTemplate(agentFlowRootPath),
    "",
  ].join("\n");
  return command;
}

function workflowTemplate(agentFlowRootPath: string): string {
  return [
    "/workflow is handled by the AgentFlow plugin interceptor.",
    "If the interceptor is unavailable, run:",
    `npm run workflow:run-profile -- --task "<task>"`,
    "Do not print this template.",
  ].join("\n");
}

function mergePlugins(existing: OpenCodeConfig["plugin"], required: string[]): OpenCodeConfig["plugin"] {
  const items = Array.isArray(existing) ? [...existing] : [];
  const existingPaths = new Set(items.map((item) => Array.isArray(item) ? item[0] : item));
  for (const plugin of required) {
    if (!existingPaths.has(plugin)) items.push(plugin);
  }
  return items;
}
