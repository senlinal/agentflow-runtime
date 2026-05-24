import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("opencode workflow command", () => {
  it("is quiet, tool-first, and has a non-shell-only fallback", async () => {
    const command = await readFile(".opencode/commands/workflow.md", "utf8");

    assert.ok(command.trimEnd().split("\n").length <= 10);
    assert.match(command, /formattedText/);
    assert.match(command, /Call AgentFlow tool/);
    assert.match(command, /No supervisor plan/);
    assert.match(command, /No unavailable tools/);
    assert.match(command, /npm run workflow:run-profile -- --task/);
    assert.doesNotMatch(command, /```json/);
    assert.doesNotMatch(command, /todowrite/);
    assert.doesNotMatch(command, /list_files/);
  });

  it("keeps run_profile_workflow as an MCP-backed compatibility wrapper", async () => {
    const toolFile = await readFile(".opencode/tools/run_profile_workflow.ts", "utf8");
    const mcpServer = await readFile("mcp/agentflow-server.ts", "utf8");

    assert.match(toolFile, /runProfileWorkflow/);
    assert.match(toolFile, /Compatibility wrapper/);
    assert.doesNotMatch(toolFile, /@opencode-ai\/plugin/);
    assert.doesNotMatch(toolFile, /export default tool\(\{/);
    assert.doesNotMatch(toolFile, /tool\.schema/);
    assert.match(mcpServer, /run_profile_workflow/);
    assert.match(mcpServer, /structuredContent/);
  });

  it("configures AgentFlow as a local MCP server and avoids automatic shell/edit permission", async () => {
    const config = await readFile("opencode.json", "utf8");

    assert.match(config, /"agentflow"/);
    assert.match(config, /"mcp\/agentflow-server\.ts"/);
    assert.match(config, /"bash": "ask"/);
    assert.match(config, /"edit": "ask"/);
    assert.match(config, /"~\/development\/garbage_item_upload\/\*\*": "allow"/);
  });
});
