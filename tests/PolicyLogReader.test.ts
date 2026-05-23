import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { PolicyLogReader } from "../adapters/opencode/PolicyLogReader.ts";

describe("PolicyLogReader", () => {
  it("reads valid JSONL", async () => {
    const dir = await mkdtemp(join(tmpdir(), "policy-log-"));
    const file = join(dir, "decisions.jsonl");
    await writeFile(file, "{\"a\":1}\n{\"b\":2}\n", "utf8");

    const result = new PolicyLogReader().readJsonl(file);

    assert.equal(result.records.length, 2);
    assert.equal(result.warnings.length, 0);
  });

  it("returns empty result for missing files", () => {
    const result = new PolicyLogReader().readJsonl("/tmp/does-not-exist-policy-log.jsonl");
    assert.deepEqual(result.records, []);
  });

  it("reports bad JSON lines with file and line", async () => {
    const dir = await mkdtemp(join(tmpdir(), "policy-log-"));
    const file = join(dir, "decisions.jsonl");
    await writeFile(file, "{\"a\":1}\nnot-json\n", "utf8");

    const result = new PolicyLogReader().readJsonl(file);

    assert.equal(result.records.length, 1);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].filePath, file);
    assert.equal(result.warnings[0].line, 2);
  });

  it("reads pending approval JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "policy-log-"));
    await mkdir(join(dir, "pending"));
    await writeFile(join(dir, "pending/policy_a.json"), "{\"decisionId\":\"policy_a\"}\n", "utf8");

    const result = new PolicyLogReader().readPendingApprovals(dir);

    assert.equal(result.records.length, 1);
  });

  it("reads replays.jsonl through readPolicyRuns", async () => {
    const dir = await mkdtemp(join(tmpdir(), "policy-log-"));
    await writeFile(join(dir, "replays.jsonl"), "{\"replayId\":\"replay_a\"}\n", "utf8");

    const result = new PolicyLogReader().readPolicyRuns(dir);

    assert.equal(result.replays.length, 1);
  });
});
