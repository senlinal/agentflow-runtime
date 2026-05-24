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

  it("registers run_profile_workflow using the OpenCode tool helper", async () => {
    const toolFile = await readFile(".opencode/tools/run_profile_workflow.ts", "utf8");

    assert.match(toolFile, /@opencode-ai\/plugin/);
    assert.match(toolFile, /export default tool\(\{/);
    assert.match(toolFile, /runProfileWorkflow/);
    assert.match(toolFile, /formatted role timeline/);
  });

  it("configures AgentFlow as a local MCP server and avoids automatic shell/edit permission", async () => {
    const config = await readFile("opencode.json", "utf8");

    assert.match(config, /"agentflow"/);
    assert.match(config, /"mcp\/agentflow-server\.ts"/);
    assert.match(config, /"bash": "ask"/);
    assert.match(config, /"edit": "ask"/);
  });
});
