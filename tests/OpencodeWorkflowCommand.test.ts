import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("opencode workflow command", () => {
  it("is quiet, tool-first, and has a non-shell-only fallback", async () => {
    const command = await readFile(".opencode/commands/workflow.md", "utf8");

    assert.match(command, /run_profile_workflow/);
    assert.match(command, /formattedText/);
    assert.match(command, /AgentFlow Role Timeline/);
    assert.match(command, /Do not print, summarize, or quote this command file/);
    assert.match(command, /neither `run_profile_workflow` nor a shell tool is available/);
    assert.match(command, /npm run workflow:run-profile -- --task/);
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
});
