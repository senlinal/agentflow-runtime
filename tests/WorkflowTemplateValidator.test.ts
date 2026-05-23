import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { WorkflowTemplateValidator } from "../core/WorkflowTemplateValidator.ts";

describe("WorkflowTemplateValidator", () => {
  it("passes for a valid template", () => {
    const config = WorkflowTemplateValidator.validate(validTemplate());
    assert.equal(config.workflow.name, "research-feasibility-execute-verify");
  });

  it("passes for abcde-basic", async () => {
    const config = await WorkflowTemplateValidator.validateWithRoleCatalog(templateFile("workflows/abcde-basic.json"));
    assert.equal(config.workflow.name, "abcde-basic");
  });

  it("passes for abcde-basic-generated", async () => {
    const config = await WorkflowTemplateValidator.validateWithRoleCatalog(templateFile("workflows/abcde-basic.generated.json"));
    assert.equal(config.workflow.name, "abcde-basic-generated");
  });

  it("ignores sourcePath metadata during validation", () => {
    const template = { ...validTemplate(), sourcePath: "workflows/research-feasibility-execute-verify.json" };
    const config = WorkflowTemplateValidator.validate(template);
    assert.equal(config.workflow.name, "research-feasibility-execute-verify");
  });

  it("fails when start node does not exist", () => {
    const template = validTemplate();
    template.start = "missing";
    assert.throws(() => WorkflowTemplateValidator.validate(template), /start node does not exist/);
  });

  it("fails when edge.from does not exist", () => {
    const template = validTemplate();
    template.edges[0].from = "missing";
    assert.throws(() => WorkflowTemplateValidator.validate(template), /from does not exist/);
  });

  it("fails when edge.to does not exist and is not end", () => {
    const template = validTemplate();
    template.edges[0].to = "missing";
    assert.throws(() => WorkflowTemplateValidator.validate(template), /to does not exist/);
  });

  it("fails when node outputSchema is missing", () => {
    const template = validTemplate();
    delete template.nodes[0].outputSchema;
    assert.throws(() => WorkflowTemplateValidator.validate(template), /outputSchema is required/);
  });

  it("fails when outputSchema is unsupported", () => {
    const template = validTemplate();
    template.nodes[0].outputSchema = "UnknownSchema";
    assert.throws(() => WorkflowTemplateValidator.validate(template), /outputSchema is unsupported/);
  });

  it("passes explicit llm nodes", () => {
    const template = validTemplate();
    template.nodes[0].type = "llm";
    template.nodes[0].retryPolicy = { maxAttempts: 2 };
    const config = WorkflowTemplateValidator.validate(template);
    assert.equal(config.nodes[0].type, "llm");
    assert.deepEqual(config.nodes[0].retryPolicy, { maxAttempts: 2 });
  });

  it("passes explicit code and test nodes", () => {
    const template = validTemplate();
    template.nodes = [
      {
        id: "code_executor",
        type: "code",
        role: "Executor",
        description: "safe code execution",
        inputKeys: ["revisedPlan"],
        outputKey: "executionResult",
        outputSchema: "ExecutionResult",
        executorConfig: { dryRun: true },
      },
      {
        id: "test_runner",
        type: "test",
        role: "Executor",
        description: "safe test execution",
        inputKeys: ["executionResult"],
        outputKey: "executionResult",
        outputSchema: "ExecutionResult",
        executorConfig: { commands: ["node -v"] },
      },
      {
        id: "execution_verifier",
        type: "verify",
        role: "Verifier",
        description: "verify execution evidence",
        inputKeys: ["codeExecutionResult", "testExecutionResult"],
        outputKey: "verification",
        outputSchema: "VerificationReport",
      },
    ];
    template.start = "code_executor";
    template.edges = [
      { from: "code_executor", to: "test_runner", condition: { type: "always" } },
      { from: "test_runner", to: "execution_verifier", condition: { type: "always" } },
      { from: "execution_verifier", to: "end", condition: { type: "always" } },
    ];

    const config = WorkflowTemplateValidator.validate(template);

    assert.equal(config.nodes[0].type, "code");
    assert.equal(config.nodes[1].type, "test");
    assert.equal(config.nodes[2].type, "verify");
    assert.deepEqual(config.nodes[0].executorConfig, { dryRun: true });
  });

  it("passes rolePreset nodes with RoleCatalog", async () => {
    const config = await WorkflowTemplateValidator.validateWithRoleCatalog(rolePresetTemplate());
    assert.equal(config.nodes[0].role, "Planner");
    assert.equal(config.nodes[0].outputSchema, "Plan");
  });

  it("fails when rolePreset is unknown", async () => {
    const template = rolePresetTemplate();
    template.nodes[0].rolePreset = "missing";
    await assert.rejects(() => WorkflowTemplateValidator.validateWithRoleCatalog(template), /Role preset not found/);
  });

  it("fails when node id is duplicated", () => {
    const template = validTemplate();
    template.nodes[1].id = template.nodes[0].id;
    assert.throws(() => WorkflowTemplateValidator.validate(template), /Duplicate node id/);
  });

  it("fails when edge points to missing node with rolePreset template", async () => {
    const template = rolePresetTemplate();
    template.edges[0].to = "missing";
    await assert.rejects(() => WorkflowTemplateValidator.validateWithRoleCatalog(template), /to does not exist/);
  });
});

function validTemplate(): any {
  return templateFile("workflows/research-feasibility-execute-verify.json");
}

function templateFile(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function rolePresetTemplate(): any {
  return {
    name: "preset-test",
    version: "1.0.0",
    description: "test",
    start: "planner",
    maxIterations: 1,
    defaultPolicies: { qualityPolicy: { principles: [], requiredChecks: [], forbiddenShortcuts: [] } },
    nodes: [{ rolePreset: "planner" }],
    edges: [{ from: "planner", to: "end", condition: { type: "always" } }],
  };
}
