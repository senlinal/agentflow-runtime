import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("opencode workflow command", () => {
  it("is quiet, tool-first, and has a non-shell-only fallback", async () => {
    const command = await readFile(".opencode/commands/workflow.md", "utf8");

    assert.match(command, /AGENTFLOW_PROJECT_ROOT/);
    assert.match(command, /opencode-workflow-command\.ts" --compact \$ARGUMENTS/);
    assert.match(command, /OpenCode Task subagent/);
    assert.match(command, /source` is `runtime_trace/);
    assert.doesNotMatch(command, /```json/);
    assert.doesNotMatch(command, /todowrite/);
    assert.doesNotMatch(command, /list_files/);
    assert.doesNotMatch(command, /agentflow_run_profile_workflow/);
    assert.doesNotMatch(command, /Research Plan/);
  });

  it("routes slash command arguments through the local AgentFlow CLI shim", async () => {
    const shim = await readFile("cli/opencode-workflow-command.ts", "utf8");

    assert.match(shim, /ProfileWorkflowRunner/);
    assert.match(shim, /formattedText/);
    assert.match(shim, /tokens\[0\] === "run"/);
    assert.doesNotMatch(shim, /CodeExecutor/);
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

    assert.match(config, /"agentflow"/);
    assert.match(config, /AGENTFLOW_PROJECT_ROOT=\./);
    assert.match(config, /mcp\/agentflow-mcp-server\.ts/);
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
});
