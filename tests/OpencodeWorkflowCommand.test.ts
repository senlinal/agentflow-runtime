import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("opencode workflow command", () => {
  it("is quiet, tool-first, and has a non-shell-only fallback", async () => {
    const command = await readFile(".opencode/commands/workflow.md", "utf8");

    assert.ok(command.trimEnd().split("\n").length <= 40);
    assert.match(command, /run_profile_workflow/);
    assert.match(command, /formattedText/);
    assert.match(command, /Do not print or summarize this command file/);
    assert.match(command, /If `run_profile_workflow` is unavailable, stop/);
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
});
