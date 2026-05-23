import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { WorkflowTemplateRegistry } from "../core/WorkflowTemplateRegistry.ts";

describe("WorkflowTemplateRegistry", () => {
  it("lists templates from workflows directory", async () => {
    const templates = await new WorkflowTemplateRegistry().listTemplates();
    assert.ok(templates.some((template) => template.name === "research-feasibility-execute-verify"));
  });

  it("listTemplates returns sourcePath", async () => {
    const templates = await new WorkflowTemplateRegistry().listTemplates();
    assert.ok(templates.every((template) => template.sourcePath.endsWith(".json")));
  });

  it("ignores non-json workflow files", async () => {
    const templates = await new WorkflowTemplateRegistry().listTemplates();
    assert.equal(templates.some((template) => template.path.endsWith(".py")), false);
    assert.equal(templates.some((template) => template.path.endsWith("__init__.py")), false);
  });

  it("loads a template by name", async () => {
    const result = await new WorkflowTemplateRegistry().load("research-feasibility-execute-verify");
    assert.equal(result.config.workflow.name, "research-feasibility-execute-verify");
  });

  it("loads a template by filename", async () => {
    const result = await new WorkflowTemplateRegistry().load("research-feasibility-execute-verify.json");
    assert.equal(result.config.workflow.name, "research-feasibility-execute-verify");
  });

  it("loads a template by path", async () => {
    const result = await new WorkflowTemplateRegistry().load("workflows/abcde-basic.json");
    assert.equal(result.config.workflow.name, "abcde-basic");
  });

  it("loads a rolePreset template by name", async () => {
    const result = await new WorkflowTemplateRegistry().load("abcde-basic");
    assert.equal(result.config.nodes.some((node) => node.rolePreset === "planner"), true);
  });

  it("throws a clear error when template is missing", async () => {
    await assert.rejects(
      () => new WorkflowTemplateRegistry().load("missing-template"),
      /Workflow template not found: missing-template/,
    );
  });

  it("detects duplicate template names and refuses ambiguous name lookup", async () => {
    const dir = await mkdtemp(join(tmpdir(), "workflow-registry-"));
    await writeFile(join(dir, "one.json"), JSON.stringify(validTemplate("dup", "a")), "utf8");
    await writeFile(join(dir, "two.json"), JSON.stringify(validTemplate("dup", "b")), "utf8");
    await writeFile(join(dir, "notes.py"), "ignored", "utf8");
    const registry = new WorkflowTemplateRegistry(dir);
    const duplicates = await registry.duplicateNames();

    assert.deepEqual(duplicates.get("dup")?.sort(), [join(dir, "one.json"), join(dir, "two.json")].sort());
    await assert.rejects(() => registry.load("dup"), /Duplicate workflow template name: dup.*one\.json.*two\.json/);
  });
});

function validTemplate(name: string, description: string) {
  return {
    name,
    version: "1.0.0",
    description,
    start: "planner",
    maxIterations: 1,
    inputSchema: "TaskBrief",
    defaultPolicies: {
      qualityPolicy: {
        principles: [],
        requiredChecks: [],
        forbiddenShortcuts: [],
      },
    },
    nodes: [{ rolePreset: "planner" }],
    edges: [{ from: "planner", to: "end", condition: { type: "always" } }],
  };
}
