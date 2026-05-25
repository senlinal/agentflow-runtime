import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

describe("opencode workflow command", () => {
  it("is quiet, tool-first, and has a non-shell-only fallback", async () => {
    const command = await readFile(".opencode/commands/workflow.md", "utf8");
    const lines = command.trimEnd().split("\n");

    assert.equal(lines.length <= 10, true);
    assert.match(command, /AgentFlow plugin interceptor/);
    assert.match(command, /npm run workflow:run-profile -- --task "<task>"/);
    assert.match(command, /Do not print this file/);
    assert.doesNotMatch(command, /AGENTFLOW_PROJECT_ROOT/);
    assert.doesNotMatch(command, /opencode-workflow-command/);
    assert.doesNotMatch(command, /!\`/);
    assert.doesNotMatch(command, /```json/);
    assert.doesNotMatch(command, /todowrite/);
    assert.doesNotMatch(command, /list_files/);
    assert.doesNotMatch(command, /auto-slash-command/);
    assert.doesNotMatch(command, /Command Instructions/);
    assert.doesNotMatch(command, /agentflow_run_profile_workflow/);
    assert.doesNotMatch(command, /Research Plan/);
  });

  it("routes slash command arguments through the local AgentFlow CLI shim", async () => {
    const shim = await readFile("cli/opencode-workflow-command.ts", "utf8");

    assert.match(shim, /ProfileWorkflowRunner/);
    assert.match(shim, /formattedText/);
    assert.match(shim, /tokens\[0\] === "run"/);
    assert.match(shim, /allowLLM: parsed\.allowLLM/);
    assert.match(shim, /--allow-llm/);
    assert.match(shim, /subagent_dispatch_trace/);
    assert.doesNotMatch(shim, /CodeExecutor/);
  });

  it("compact fallback shows verified subagent dispatch role progress", async () => {
    const { stdout } = await execFileAsync("node", [
      "--experimental-strip-types",
      "cli/opencode-workflow-command.ts",
      "--compact",
      "run",
      "agent-workforce-basic",
      "演示 Planner、Debater、Executor、Verifier 多角色协作",
    ], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024,
    });

    assert.match(stdout, /Runtime proof: started=true, roles=\d+, source=subagent_dispatch_trace/);
    assert.match(stdout, /Dispatch targets: @agentflow-planner/);
    assert.match(stdout, /Role Coordination/);
    assert.match(stdout, /Role Progress/);
    assert.match(stdout, /Role Speech/);
    assert.match(stdout, /artifact=.*output\.json/);
    assert.match(stdout, /source=subagent_dispatch_trace/);
    assert.doesNotMatch(stdout, /No runtime trace roles were verified/);
    assert.doesNotMatch(stdout, /我已经根据用户目标制定了计划/);
  });

  it("compact fallback parses --allow-llm instead of treating it as task text", async () => {
    const { stdout } = await execFileAsync("node", [
      "--experimental-strip-types",
      "cli/opencode-workflow-command.ts",
      "--compact",
      "--allow-llm",
      "run",
      "agent-workforce-basic",
      "演示多角色协作",
    ], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024,
    });

    assert.match(stdout, /Allow LLM: true/);
    assert.doesNotMatch(stdout, /User command: .*--allow-llm/);
  });

  it("keeps run_profile_workflow as an MCP-backed compatibility wrapper", async () => {
    const toolFile = await readFile(".opencode/tools/run_profile_workflow.ts", "utf8");
    const mcpServer = await readFile("mcp/agentflow-mcp-server.ts", "utf8");

    assert.match(toolFile, /runProfileWorkflow/);
    assert.match(toolFile, /Compatibility wrapper/);
    assert.doesNotMatch(toolFile, /@opencode-ai\/plugin/);
    assert.doesNotMatch(toolFile, /export default tool\(\{/);
    assert.doesNotMatch(toolFile, /tool\.schema/);
    assert.match(mcpServer, /agentflow_run_profile_workflow/);
    assert.match(mcpServer, /run_profile_workflow/);
    assert.match(mcpServer, /structuredContent/);
  });

  it("configures AgentFlow as a local MCP server and avoids automatic shell/edit permission", async () => {
    const config = await readFile("opencode.json", "utf8");

    assert.match(config, /"plugin"/);
    assert.match(config, /\.opencode\/plugins\/agentflow-policy\.ts/);
    assert.match(config, /\.opencode\/plugins\/agentflow-workflow-interceptor\.ts/);
    assert.match(config, /"agentflow"/);
    assert.match(config, /AGENTFLOW_PROJECT_ROOT=\./);
    assert.match(config, /mcp\/agentflow-mcp-server\.ts/);
    assert.doesNotMatch(config, /opencode-workflow-command\.ts/);
    assert.match(config, /"bash": "ask"/);
    assert.match(config, /"edit": "ask"/);
    assert.match(config, /"task"/);
    assert.match(config, /"agentflow-\*": "allow"/);
    assert.match(config, /"~\/development\/garbage_item_upload\/\*\*": "allow"/);
    assert.match(config, /"\/Users\/\*\/development\/garbage_item_upload\/\*\*": "allow"/);
  });

  it("defines AgentFlow role subagents for OpenCode Task dispatch", async () => {
    const planner = await readFile(".opencode/agents/agentflow-planner.md", "utf8");
    const verifier = await readFile(".opencode/agents/agentflow-verifier.md", "utf8");

    assert.match(planner, /mode: subagent/);
    assert.match(planner, /verified AgentFlow runtime trace item/);
    assert.match(verifier, /mode: subagent/);
    assert.match(verifier, /role Verifier/);
  });

  it("exports the policy plugin as an OpenCode plugin function", async () => {
    const plugin = await readFile(".opencode/plugins/agentflow-policy.ts", "utf8");

    assert.match(plugin, /export async function AgentFlowPolicy/);
    assert.match(plugin, /export default AgentFlowPolicy/);
    assert.match(plugin, /tool\.execute\.before/);
  });

  it("exports the workflow interceptor plugin as an OpenCode plugin function", async () => {
    const plugin = await readFile(".opencode/plugins/agentflow-workflow-interceptor.ts", "utf8");

    assert.match(plugin, /export async function AgentFlowWorkflowInterceptor/);
    assert.match(plugin, /export default AgentFlowWorkflowInterceptor/);
    assert.match(plugin, /command\.execute\.before/);
    assert.match(plugin, /agentflow_run_profile_workflow/);
    assert.doesNotMatch(plugin, /todowrite/);
    assert.doesNotMatch(plugin, /list_files/);
    assert.doesNotMatch(plugin, /Research Plan/);
  });

  it("global installer prepends AgentFlow plugins before supervisor plugins", async () => {
    const configDir = await mkdtemp(join(tmpdir(), "agentflow-opencode-global-"));
    await writeFile(join(configDir, "opencode.json"), JSON.stringify({
      plugin: ["./plugin/supervisor.js", "oh-my-openagent@latest"],
      permission: { task: { "*": "deny" } },
    }), "utf8");

    await execFileAsync("node", [
      "--experimental-strip-types",
      "scripts/opencode-install-global.ts",
    ], {
      cwd: process.cwd(),
      env: { ...process.env, OPENCODE_CONFIG_DIR: configDir },
      maxBuffer: 1024 * 1024,
    });

    const config = JSON.parse(await readFile(join(configDir, "opencode.json"), "utf8")) as { plugin: string[]; command: { workflow: { template: string } } };
    assert.match(config.plugin[0], /agentflow-policy\.ts$/);
    assert.match(config.plugin[1], /agentflow-workflow-interceptor\.ts$/);
    assert.equal(config.plugin.includes("./plugin/supervisor.js"), true);
    assert.equal(config.plugin.includes("oh-my-openagent@latest"), true);
    assert.doesNotMatch(config.command.workflow.template, /opencode-workflow-command/);
    assert.doesNotMatch(config.command.workflow.template, /AGENTFLOW_PROJECT_ROOT/);
  });
});
