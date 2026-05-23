import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { formatPolicyTimelineText, PolicyTimelineService } from "../adapters/opencode/PolicyTimelineService.ts";

describe("PolicyTimelineService", () => {
  it("creates timeline for ask decision", async () => {
    const dir = await fixture();
    const timeline = new PolicyTimelineService(dir).buildTimeline("policy_a");

    assert.equal(timeline.rootDecisionId, "policy_a");
    assert.ok(timeline.events.some((event) => event.type === "decision" && event.action === "ask"));
  });

  it("includes approval event", async () => {
    const dir = await fixture({ approvalStatus: "approved" });
    const timeline = new PolicyTimelineService(dir).buildTimeline("policy_a");

    assert.equal(timeline.status, "approved");
    assert.ok(timeline.events.some((event) => event.type === "approval" && event.status === "approved"));
  });

  it("sets rejected status", async () => {
    const dir = await fixture({ approvalStatus: "rejected" });
    const timeline = new PolicyTimelineService(dir).buildTimeline("policy_a");
    assert.equal(timeline.status, "rejected");
  });

  it("includes dry-run replay planned", async () => {
    const dir = await fixture({ replayStatus: "planned" });
    const timeline = new PolicyTimelineService(dir).buildTimeline("policy_a");
    assert.ok(timeline.events.some((event) => event.type === "replay" && event.status === "planned"));
  });

  it("sets consumed after executed replay and consumed approval", async () => {
    const dir = await fixture({ approvalStatus: "consumed", replayStatus: "executed" });
    const timeline = new PolicyTimelineService(dir).buildTimeline("policy_a");

    assert.equal(timeline.status, "consumed");
    assert.ok(timeline.events.some((event) => event.type === "consumed"));
  });

  it("sets denied status for deny decision", async () => {
    const dir = await fixture({ decisionAction: "deny" });
    const timeline = new PolicyTimelineService(dir).buildTimeline("policy_a");
    assert.equal(timeline.status, "denied");
  });

  it("throws for unknown decisionId", async () => {
    const dir = await fixture();
    assert.throws(() => new PolicyTimelineService(dir).buildTimeline("missing"), /not found/);
  });

  it("sorts events by timestamp", async () => {
    const dir = await fixture({ approvalStatus: "approved", replayStatus: "planned" });
    const timeline = new PolicyTimelineService(dir).buildTimeline("policy_a");
    const timestamps = timeline.events.map((event) => event.timestamp).filter(Boolean) as string[];
    assert.deepEqual(timestamps, [...timestamps].sort());
  });

  it("includes bad log warnings", async () => {
    const dir = await fixture();
    await writeFile(join(dir, "approvals.jsonl"), "bad-json\n", { flag: "a" });
    const timeline = new PolicyTimelineService(dir).buildTimeline("policy_a");
    assert.ok(timeline.warnings.length > 0);
  });

  it("formats text with ASK APPROVE REPLAY CONSUMED", async () => {
    const dir = await fixture({ approvalStatus: "consumed", replayStatus: "executed" });
    const text = formatPolicyTimelineText(new PolicyTimelineService(dir).buildTimeline("policy_a"));
    assert.match(text, /ASK/);
    assert.match(text, /REPLAY/);
    assert.match(text, /CONSUMED/);
    assert.match(text, /rm file/);
  });

  it("json format is serializable", async () => {
    const dir = await fixture();
    const parsed = JSON.parse(JSON.stringify(new PolicyTimelineService(dir).buildTimeline("policy_a")));
    assert.equal(parsed.rootDecisionId, "policy_a");
  });
});

async function fixture(options: {
  decisionAction?: "ask" | "allow" | "deny";
  approvalStatus?: "approved" | "rejected" | "consumed";
  replayStatus?: "planned" | "executed";
} = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "policy-timeline-"));
  await mkdir(join(dir, "pending"));
  await writeFile(join(dir, "decisions.jsonl"), `${JSON.stringify({
    decisionId: "policy_a",
    timestamp: "2026-01-01T00:00:00.000Z",
    action: options.decisionAction ?? "ask",
    riskLevel: "high",
    matchedRule: "delete-existing-project-file",
    reason: "needs approval",
    toolName: "bash",
    command: "rm file",
    affectedPaths: ["file"],
    toolCallHash: "hash-a",
  })}\n`, "utf8");
  if (options.approvalStatus) {
    await writeFile(join(dir, "approvals.jsonl"), `${JSON.stringify({
      decisionId: "policy_a",
      status: options.approvalStatus,
      resolvedAt: "2026-01-01T00:01:00.000Z",
      consumedAt: options.approvalStatus === "consumed" ? "2026-01-01T00:03:00.000Z" : undefined,
      riskLevel: "high",
      matchedRule: "delete-existing-project-file",
      reason: "needs approval",
      note: options.approvalStatus,
      toolName: "bash",
      command: "rm file",
      affectedPaths: ["file"],
    })}\n`, "utf8");
  } else {
    await writeFile(join(dir, "pending/policy_a.json"), `${JSON.stringify({
      decisionId: "policy_a",
      status: "pending",
      createdAt: "2026-01-01T00:00:30.000Z",
      riskLevel: "high",
      matchedRule: "delete-existing-project-file",
      reason: "needs approval",
      toolName: "bash",
      command: "rm file",
      affectedPaths: ["file"],
      toolCallHash: "hash-a",
    })}\n`, "utf8");
  }
  if (options.replayStatus) {
    await writeFile(join(dir, "replays.jsonl"), `${JSON.stringify({
      replayId: "replay_a",
      originalDecisionId: "policy_a",
      timestamp: "2026-01-01T00:02:00.000Z",
      mode: options.replayStatus === "planned" ? "dry-run" : "execute",
      status: options.replayStatus,
      exitCode: options.replayStatus === "executed" ? 0 : null,
      command: "rm file",
      affectedPaths: ["file"],
      reason: options.replayStatus,
      toolCallHash: "hash-a",
    })}\n`, "utf8");
  }
  return dir;
}
