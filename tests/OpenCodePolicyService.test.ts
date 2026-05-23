import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { PolicyApprovalStore } from "../adapters/opencode/PolicyApprovalStore.ts";
import { PolicyAuditLogger } from "../adapters/opencode/PolicyAuditLogger.ts";
import { OpenCodePolicyService } from "../adapters/opencode/OpenCodePolicyService.ts";

describe("OpenCodePolicyService", () => {
  it("allows low-risk bash commands", async () => {
    const service = await makeService();
    const decision = service.evaluateToolCall({ tool: "bash", args: { command: "npm run test" } });
    assert.equal(decision.action, "allow");
    assert.equal(decision.riskLevel, "low");
    assert.ok(decision.reason);
    assert.ok(decision.matchedRule);
    assert.ok(decision.decisionId);
    assert.equal(decision.requiresApproval, false);
    assert.ok(decision.auditPath.endsWith("decisions.jsonl"));
    assert.equal(decision.pendingApprovalPath, undefined);
  });

  it("asks before bash deletes existing file", async () => {
    const service = await makeService();
    const decision = service.evaluateToolCall({ tool: "bash", args: { command: "rm existing.txt" } });
    assert.equal(decision.action, "ask");
    assert.equal(decision.riskLevel, "high");
    assert.equal(decision.requiresApproval, true);
    assert.ok(decision.pendingApprovalPath?.endsWith(`${decision.decisionId}.json`));
  });

  it("allows bash deleting session-created temp file", async () => {
    const service = await makeService();
    service.registerCreatedFile("temp.txt");
    assert.equal(service.evaluateBashCommand("rm temp.txt").action, "allow");
  });

  it("allows normal edit operations", async () => {
    const service = await makeService();
    const decision = service.evaluateToolCall({ tool: "edit", args: { path: "existing.txt" } });
    assert.equal(decision.action, "allow");
  });

  it("asks before edit deletes existing file", async () => {
    const service = await makeService();
    const decision = service.evaluateToolCall({ tool: "delete", args: { path: "existing.txt" } });
    assert.equal(decision.action, "ask");
  });

  it("asks for external paths", async () => {
    const service = await makeService();
    const decision = service.evaluateToolCall({ tool: "edit", args: { path: "/etc/passwd" } });
    assert.equal(decision.action, "ask");
    assert.ok(decision.affectedPaths.length > 0);
  });

  it("writes deny decisions to audit log", async () => {
    const service = await makeService();
    const decision = service.evaluateToolCall({ tool: "write", args: { path: "id_rsa" } });
    assert.equal(decision.action, "deny");
    assert.equal(decision.requiresApproval, false);
    assert.equal(decision.pendingApprovalPath, undefined);
    assert.ok(decision.decisionId);
  });

  it("allows one approved replay with the same tool call", async () => {
    const service = await makeService();
    const ask = service.evaluateToolCall({ tool: "bash", args: { command: "rm existing.txt" } });
    assert.equal(ask.action, "ask");
    service.approvalStoreForTests().approve(ask.decisionId, "approved");

    const replay = service.evaluateToolCall({
      tool: "bash",
      args: { command: "rm existing.txt", approvalId: ask.decisionId },
    });

    assert.equal(replay.action, "allow");
    assert.equal(replay.matchedRule, "approval-replay");
    assert.equal(replay.replayConsumed, true);
  });

  it("denies replay when command changes", async () => {
    const service = await makeService();
    const ask = service.evaluateToolCall({ tool: "bash", args: { command: "rm existing.txt" } });
    service.approvalStoreForTests().approve(ask.decisionId, "approved");

    const replay = service.evaluateToolCall({
      tool: "bash",
      args: { command: "rm other.txt", approvalId: ask.decisionId },
    });

    assert.equal(replay.action, "deny");
    assert.equal(replay.matchedRule, "approval-replay-integrity-failed");
  });

  it("denies replay after approval is consumed", async () => {
    const service = await makeService();
    const ask = service.evaluateToolCall({ tool: "bash", args: { command: "rm existing.txt" } });
    service.approvalStoreForTests().approve(ask.decisionId, "approved");
    service.evaluateToolCall({ tool: "bash", args: { command: "rm existing.txt", approvalId: ask.decisionId } });

    const replay = service.evaluateToolCall({
      tool: "bash",
      args: { command: "rm existing.txt", approvalId: ask.decisionId },
    });

    assert.equal(replay.action, "deny");
  });
});

async function makeService(): Promise<OpenCodePolicyService> {
  const dir = await mkdtemp(join(tmpdir(), "policy-service-"));
  const auditDir = await mkdtemp(join(tmpdir(), "policy-service-audit-"));
  await writeFile(join(dir, "existing.txt"), "x", "utf8");
  const auditLogger = new PolicyAuditLogger(auditDir);
  return new OpenCodePolicyService(dir, undefined, auditLogger, new PolicyApprovalStore(auditDir));
}
