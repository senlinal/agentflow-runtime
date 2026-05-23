import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createInitialContext } from "../core/context.ts";
import { NodeRegistry } from "../core/NodeRegistry.ts";
import { negotiateTask } from "../core/negotiation/TaskNegotiatorExecutor.ts";
import { ScopeConfirmationService } from "../core/scope/ScopeConfirmationService.ts";
import { ScopeConfirmationStore } from "../core/scope/ScopeConfirmationStore.ts";
import { TaskBriefLoader } from "../core/TaskBriefLoader.ts";
import { WorkflowGraph } from "../core/WorkflowGraph.ts";
import { WorkflowRuntime } from "../core/WorkflowRuntime.ts";
import { WorkflowTemplateRegistry } from "../core/WorkflowTemplateRegistry.ts";
import type { ScopeConfirmationRecord, TaskNegotiationResult } from "../core/types.ts";

describe("ScopeConfirmationRecord and ConfirmedScopeGate", () => {
  it("creates a confirmed RAG scope record without expanding negotiated scope", async () => {
    const negotiation = await ragNegotiation();
    const record = createRagRecord(negotiation);

    assert.equal(record.status, "confirmed");
    assert.equal(record.humanOverride, false);
    assert.equal(record.confirmedScope.metricDefinition?.primaryMetric, "answer relevance");
    assert.equal(record.confirmedScope.ragConstraints?.allowAnswerQualityRegression, false);
  });

  it("rejects confirmed RAG scope without metric and RAG constraints", async () => {
    const negotiation = await ragNegotiation();
    assert.throws(
      () => new ScopeConfirmationService().createRecord({ negotiation }),
      /Confirmed RAG scope requires metricDefinition\.primaryMetric/,
    );
  });

  it("blocks scope expansion unless humanOverride is true", async () => {
    const negotiation = await ragNegotiation();
    assert.throws(
      () => createRagRecord(negotiation, { allowedActions: ["inspect_project", "evaluate_feasibility", "modify_files"] }),
      /allowedActions adds modify_files/,
    );
    const record = createRagRecord(negotiation, { allowedActions: ["inspect_project", "evaluate_feasibility", "modify_files"] }, true);
    assert.equal(record.humanOverride, true);
  });

  it("allows only confirmed unexpired records through the gate", async () => {
    const negotiation = await ragNegotiation();
    const record = createRagRecord(negotiation);
    const service = new ScopeConfirmationService();
    assert.equal(service.evaluateGate(record, negotiation).allowed, true);
    assert.equal(service.evaluateGate({ ...record, status: "needs_revision" }, negotiation).allowed, false);
    assert.equal(service.evaluateGate({ ...record, expiresAt: "2000-01-01T00:00:00.000Z" }, negotiation).allowed, false);
  });

  it("persists and queries scope confirmations", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scope-store-"));
    const store = new ScopeConfirmationStore(dir);
    const record = createRagRecord(await ragNegotiation());
    await store.save(record);

    assert.equal((await store.get(record.confirmationId)).confirmationId, record.confirmationId);
    assert.equal((await store.list({ status: "confirmed" })).length, 1);
    assert.equal((await store.list({ negotiationId: record.negotiationId })).length, 1);
  });

  it("runs confirmed-scope-gate workflow without CodeExecutor or tests", async () => {
    const taskBrief = await TaskBriefLoader.loadJson("inputs/task-negotiation-rag-task.json");
    const negotiation = negotiateTask(taskBrief);
    const record = createRagRecord(negotiation);
    const { config } = await new WorkflowTemplateRegistry().load("confirmed-scope-gate");
    const finalContext = await new WorkflowRuntime(new WorkflowGraph(config), NodeRegistry.withDefaults()).run({
      ...createInitialContext({ taskId: taskBrief.taskId, userGoal: taskBrief.goal }),
      taskBrief,
      taskNegotiationResult: negotiation,
      scopeConfirmationRecord: record,
    });

    assert.equal(finalContext.confirmedScopeGateResult?.allowed, true);
    assert.deepEqual(finalContext.trace.map((item) => item.nodeId), ["confirmedScopeGate"]);
    assert.equal(finalContext.codeExecutionResult, null);
    assert.equal(finalContext.testExecutionResult, null);
  });
});

async function ragNegotiation(): Promise<TaskNegotiationResult> {
  const taskBrief = await TaskBriefLoader.loadJson("inputs/task-negotiation-rag-task.json");
  return negotiateTask(taskBrief);
}

function createRagRecord(
  negotiation: TaskNegotiationResult,
  scopeOverride: Partial<ScopeConfirmationRecord["confirmedScope"]> = {},
  humanOverride = false,
): ScopeConfirmationRecord {
  return new ScopeConfirmationService().createRecord({
    negotiation,
    humanOverride,
    confirmedBy: "test-user",
    confirmedScope: {
      allowedActions: ["inspect_project", "evaluate_feasibility"],
      metricDefinition: {
        primaryMetric: "answer relevance",
        secondaryMetrics: ["citation coverage"],
        targetValue: "improve relevance without citation regression",
        evaluationDataset: "small offline eval set",
      },
      ragConstraints: {
        recallLevel: "chunk",
        allowChunkChanges: true,
        allowIndexRebuild: false,
        allowRerankerChanges: false,
        allowQueryRewrite: true,
        allowAnswerQualityRegression: false,
        productionChangesAllowed: false,
      },
      ...scopeOverride,
    },
  });
}
