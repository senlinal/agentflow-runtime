import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { RuntimeTraceRoleExtractor } from "../core/profile/RuntimeTraceRoleExtractor.ts";

const extractor = new RuntimeTraceRoleExtractor();

test("RuntimeTraceRoleExtractor", async (t) => {
  await t.test("extracts runtime roles from trace JSON only", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentflow-trace-extractor-"));
    const tracePath = join(dir, "trace.json");
    await writeFile(tracePath, JSON.stringify([
      {
        step: 0,
        nodeId: "planner",
        role: "Planner",
        nodeType: "mock",
        inputKeys: ["taskBrief"],
        outputKey: "plan",
        outputSchema: "Plan",
        outputSummary: "plan summary",
        conditionResults: [],
        nextNode: "debater",
        timestamp: "2026-05-24T00:00:00.000Z",
      },
      {
        step: 1,
        nodeId: "debater",
        role: "Debater",
        nodeType: "mock",
        inputKeys: ["plan"],
        outputKey: "critique",
        outputSchema: "Critique",
        outputSummary: "critique summary",
        conditionResults: [],
        nextNode: "executor",
        timestamp: "2026-05-24T00:00:01.000Z",
      },
      {
        step: 2,
        nodeId: "executor",
        role: "Executor",
        nodeType: "mock",
        inputKeys: ["revisedPlan"],
        outputKey: "executionResult",
        outputSchema: "ExecutionResult",
        outputSummary: "execution summary",
        conditionResults: [],
        nextNode: "verifier",
        timestamp: "2026-05-24T00:00:02.000Z",
      },
      {
        step: 3,
        nodeId: "verifier",
        role: "Verifier",
        nodeType: "mock",
        inputKeys: ["executionResult"],
        outputKey: "verification",
        outputSchema: "VerificationReport",
        outputSummary: "verification summary",
        conditionResults: [],
        nextNode: "end",
        timestamp: "2026-05-24T00:00:03.000Z",
      },
    ]), "utf8");

    const roles = await extractor.extractFromTraceFile(tracePath, { workflow: "abcde-basic" });

    assert.deepEqual(roles.map((role) => role.role), ["Planner", "Debater", "Executor", "Verifier"]);
    assert.equal(roles.every((role) => role.source === "runtime_trace"), true);
    assert.equal(roles[0].outputSchema, "Plan");
    assert.equal(roles[0].type, "mock");
  });

  await t.test("throws clearly when trace file is missing", async () => {
    await assert.rejects(
      () => extractor.extractFromTraceFile(join(tmpdir(), "missing-agentflow-trace.json")),
      /AgentFlow Runtime trace was not found/,
    );
  });

  await t.test("empty trace returns no roles", () => {
    assert.deepEqual(extractor.extractFromTrace([]), []);
  });

  await t.test("does not extract roles from plain text or fabricated output", () => {
    const roles = extractor.extractFromTrace([
      "[Planner] fake text",
      { message: "[Debater] fake object without runtime trace fields" },
    ]);

    assert.deepEqual(roles, []);
  });
});
