import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { TemplateScaffolder } from "../core/TemplateScaffolder.ts";
import { WorkflowTemplateValidator } from "../core/WorkflowTemplateValidator.ts";

describe("TemplateScaffolder", () => {
  it("generates a WorkflowTemplate from abcde-basic spec", async () => {
    const template = await new TemplateScaffolder().scaffoldFromFile("template-specs/abcde-basic.json");
    assert.ok(template.nodes.length > 0);
    assert.ok(template.edges.length > 0);
    WorkflowTemplateValidator.validate(template);
  });

  it("fails when rolePresets is missing", async () => {
    const spec = JSON.parse(readFileSync("template-specs/abcde-basic.json", "utf8"));
    delete spec.rolePresets;
    await assert.rejects(() => new TemplateScaffolder().scaffold(spec), /rolePresets is required/);
  });

  it("fails when rolePreset is unknown", async () => {
    const spec = JSON.parse(readFileSync("template-specs/abcde-basic.json", "utf8"));
    spec.rolePresets = ["missing-role"];
    await assert.rejects(() => new TemplateScaffolder().scaffold(spec), /Role preset not found/);
  });

  it("supports name override", async () => {
    const template = await new TemplateScaffolder().scaffoldFromFile("template-specs/abcde-basic.json", {
      name: "abcde-basic-override",
    });
    assert.equal(template.workflow.name, "abcde-basic-override");
    WorkflowTemplateValidator.validate(template);
  });

  it("supports description override", async () => {
    const template = await new TemplateScaffolder().scaffoldFromFile("template-specs/abcde-basic.json", {
      description: "Overridden description.",
    });
    assert.equal(template.workflow.description, "Overridden description.");
    WorkflowTemplateValidator.validate(template);
  });
});
