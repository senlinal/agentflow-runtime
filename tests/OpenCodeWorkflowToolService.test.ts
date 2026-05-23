import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { OpenCodeWorkflowToolService } from "../adapters/opencode/OpenCodeWorkflowToolService.ts";

describe("OpenCodeWorkflowToolService", () => {
  it("runs feasible task with inputPath and returns trace paths", async () => {
    const result = await new OpenCodeWorkflowToolService().runWorkflow({
      template: "research-feasibility-execute-verify",
      inputPath: "inputs/feasible-task.json",
    });

    assert.equal(result.finalStatus, "passed");
    assert.equal(result.enteredExecutor, true);
    assert.ok(result.summaryPath.endsWith("summary.md"));
    assert.ok(result.tracePath.endsWith("trace.json"));
    assert.ok(result.contextPath.endsWith("context.json"));
  });

  it("runs infeasible task without entering Executor", async () => {
    const result = await new OpenCodeWorkflowToolService().runWorkflow({
      template: "research-feasibility-execute-verify",
      inputPath: "inputs/infeasible-task.json",
    });

    assert.equal(result.enteredExecutor, false);
    assert.match(result.feasibilityDecision ?? "", /ask_human|revise_goal|stop/);
    assert.equal(result.costLevel, "high");
  });

  it("runs with inline taskBrief", async () => {
    const result = await new OpenCodeWorkflowToolService().runWorkflow({
      template: "research-feasibility-execute-verify",
      taskBrief: {
        goal: "基于当前 Runtime 增加 opencode command adapter。",
        currentState: "已有 WorkflowRunner、WorkflowTemplateRegistry 和 MockLLMClient。",
        constraints: ["不接真实 LLM", "不做 UI"],
        resources: ["当前 TypeScript 项目"],
        budget: "local-only",
        successCriteria: ["可以从 adapter 运行 workflow", "生成 trace"],
        nonGoals: ["不做 plugin hook"],
      },
    });

    assert.ok(result.runId);
    assert.equal(result.enteredExecutor, true);
  });

  it("runs profile workflow with safe preflight and blocks before scope gate", async () => {
    const result = await new OpenCodeWorkflowToolService().runProfileWorkflow({
      profileId: "rag-optimization",
      task: "继续 RAG 召回优化，分析上一轮实验结果。",
    });

    assert.equal(result.profileId, "rag-optimization");
    assert.equal(result.finalStatus, "blocked");
    assert.equal(result.steps[0].workflow, "task-negotiation");
    assert.equal(result.steps[0].enteredExecutor, false);
    assert.equal(result.steps[1].workflow, "confirmed-scope-gate");
    assert.equal(result.steps[1].status, "blocked");
  });

  it("lists workflows", async () => {
    const result = await new OpenCodeWorkflowToolService().listWorkflows();
    assert.ok(result.workflows.some((item) => item.name === "abcde-basic"));
    assert.ok(result.workflows.every((item) => item.sourcePath.endsWith(".json")));
  });

  it("inspects workflow with sourcePath", async () => {
    const result = await new OpenCodeWorkflowToolService().inspectWorkflow({ template: "abcde-basic" });
    assert.equal(result.name, "abcde-basic");
    assert.equal(result.sourcePath, "workflows/abcde-basic.json");
    assert.ok(result.nodes.length > 0);
    assert.ok(result.edges.length > 0);
  });

  it("validates workflow", async () => {
    const result = await new OpenCodeWorkflowToolService().validateWorkflow({ template: "abcde-basic" });
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
    assert.equal(result.sourcePath, "workflows/abcde-basic.json");
  });

  it("returns validation errors for missing workflow", async () => {
    const result = await new OpenCodeWorkflowToolService().validateWorkflow({ template: "missing-template" });
    assert.equal(result.valid, false);
    assert.match(result.errors[0], /Workflow template not found/);
  });

  it("createWorkflow fails when out exists and force=false", async () => {
    const dir = await mkdtemp(join(tmpdir(), "opencode-create-"));
    const outPath = join(dir, "existing.json");
    await writeFile(outPath, "{}\n", "utf8");

    const result = await new OpenCodeWorkflowToolService().createWorkflow({
      specPath: "template-specs/abcde-basic.json",
      outPath,
      name: "opencode-existing-test",
    });

    assert.equal(result.created, false);
    assert.match(result.error ?? "", /Output file already exists/);
  });

  it("createWorkflow succeeds with a new name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "opencode-create-"));
    const outPath = join(dir, "created.json");

    const result = await new OpenCodeWorkflowToolService().createWorkflow({
      specPath: "template-specs/abcde-basic.json",
      outPath,
      name: "opencode-created-test",
      description: "Created from an opencode tool service test.",
    });

    assert.equal(result.created, true);
    assert.equal(result.createdPath, outPath);
    assert.equal(result.name, "opencode-created-test");
    assert.equal(result.nodeCount, 6);
    assert.equal(result.edgeCount, 7);
  });
});
