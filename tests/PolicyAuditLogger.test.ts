import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { PolicyAuditLogger } from "../adapters/opencode/PolicyAuditLogger.ts";
import type { PolicyDecision } from "../adapters/opencode/ShellRiskClassifier.ts";

describe("PolicyAuditLogger", () => {
  it("writes allow decisions to decisions.jsonl", async () => {
    const logger = await makeLogger();
    const { record } = logger.record({
      decision: decision("allow"),
      toolName: "bash",
      toolArgs: { command: "npm run test" },
      command: "npm run test",
      projectRoot: "/project",
    });

    const lines = await readJsonl(logger.path("decisions.jsonl"));
    assert.equal(lines.length, 1);
    assert.equal(lines[0].decisionId, record.decisionId);
    assert.equal(lines[0].action, "allow");
  });

  it("writes ask and deny decisions as parseable JSONL", async () => {
    const logger = await makeLogger();
    logger.record({ decision: decision("ask"), toolName: "bash", projectRoot: "/project" });
    logger.record({ decision: decision("deny"), toolName: "write", projectRoot: "/project" });

    const lines = await readJsonl(logger.path("decisions.jsonl"));
    assert.deepEqual(lines.map((line) => line.action), ["ask", "deny"]);
  });

  it("creates directories when missing", async () => {
    const logger = new PolicyAuditLogger(join(await mkdtemp(join(tmpdir(), "audit-parent-")), "missing"));
    logger.record({ decision: decision("allow"), toolName: "bash", projectRoot: "/project" });

    const lines = await readJsonl(logger.path("decisions.jsonl"));
    assert.equal(lines.length, 1);
  });

  it("truncates large toolArgs", async () => {
    const logger = await makeLogger();
    logger.record({
      decision: decision("allow"),
      toolName: "bash",
      toolArgs: { payload: "x".repeat(1500) },
      projectRoot: "/project",
    });

    const [line] = await readJsonl(logger.path("decisions.jsonl"));
    assert.match(line.toolArgs.payload, /\[truncated\]/);
  });

  it("redacts sensitive fields", async () => {
    const logger = await makeLogger();
    logger.record({
      decision: decision("ask"),
      toolName: "bash",
      toolArgs: { token: "secret-token", command: "echo token=secret-token" },
      command: "echo token=secret-token",
      projectRoot: "/project",
    });

    const [line] = await readJsonl(logger.path("decisions.jsonl"));
    assert.equal(line.toolArgs.token, "[REDACTED]");
    assert.equal(line.command, "echo token=[REDACTED]");
  });
});

async function makeLogger(): Promise<PolicyAuditLogger> {
  return new PolicyAuditLogger(await mkdtemp(join(tmpdir(), "policy-audit-")));
}

function decision(action: "allow" | "ask" | "deny"): PolicyDecision {
  return {
    action,
    riskLevel: action === "allow" ? "low" : "high",
    reason: `${action} reason`,
    matchedRule: `${action}-rule`,
    affectedPaths: [],
  };
}

async function readJsonl(path: string): Promise<Array<Record<string, any>>> {
  return (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}
