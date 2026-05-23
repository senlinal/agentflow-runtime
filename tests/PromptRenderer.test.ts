import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { PromptRenderer, roleToPromptName } from "../core/PromptRenderer.ts";

describe("PromptRenderer", () => {
  it("loads role prompt files and renders schema guidance", () => {
    const rendered = new PromptRenderer().render({
      role: "Verifier",
      input: { taskBrief: { successCriteria: ["pass tests"] } },
      outputSchemaName: "VerificationReport",
    });

    assert.match(rendered.systemPrompt, /Verifier node/);
    assert.match(rendered.userPrompt, /Return only one JSON object/);
    assert.match(rendered.userPrompt, /TaskBrief\.constraints/);
    assert.equal(rendered.promptPath?.endsWith("prompts/roles/verifier.md"), true);
  });

  it("uses a safe default prompt when a role prompt file is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prompt-renderer-"));
    const rendered = new PromptRenderer(dir).render({
      role: "Planner",
      input: {},
      outputSchemaName: "Plan",
    });

    assert.match(rendered.systemPrompt, /Return only one JSON object/);
    assert.equal(rendered.promptPath, undefined);
  });

  it("maps roles to stable prompt filenames", () => {
    assert.equal(roleToPromptName("FeasibilityEvaluator"), "feasibility-evaluator");
    assert.equal(roleToPromptName("GoalKeeper"), "goal-keeper");
  });

  it("allows custom prompt directories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prompt-renderer-"));
    await writeFile(join(dir, "planner.md"), "custom planner prompt", "utf8");
    const rendered = new PromptRenderer(dir).render({ role: "Planner", input: {}, outputSchemaName: "Plan" });
    assert.match(rendered.systemPrompt, /custom planner prompt/);
  });
});
