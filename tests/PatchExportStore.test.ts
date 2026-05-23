import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { PatchExportStore } from "../core/patch/PatchExportStore.ts";
import { formatPatchExportList, formatPatchExportRecord } from "../core/patch/PatchExportFormatter.ts";

describe("PatchExportStore", () => {
  it("saves patch, metadata, apply guide, and list summaries", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "agentflow-patch-exports-"));
    const store = new PatchExportStore(baseDir);

    const result = await store.save({
      executionId: "code_exec_patch_test",
      sourceProjectPath: "/tmp/source-project",
      workspaceRoot: "/tmp/copied-workspace",
      patchText: [
        "diff --git a/src/calculator.ts b/src/calculator.ts",
        "--- a/src/calculator.ts",
        "+++ b/src/calculator.ts",
        "@@ -1,3 +1,3 @@",
        " export function add(a: number, b: number): number {",
        "-  return a - b;",
        "+  return a + b;",
        " }",
        "",
      ].join("\n"),
      changedFiles: ["src/calculator.ts"],
      filesAdded: [],
      filesModified: ["src/calculator.ts"],
      filesDeleted: [],
      testStatus: "passed",
      verificationPass: true,
    });

    assert.ok(result.record.patchExportId.startsWith("patch_export_"));
    assert.ok(result.record.patchHash.startsWith("sha256:"));
    assert.equal(result.record.safeToApplyManually, true);
    assert.equal(result.record.insertions, 1);
    assert.equal(result.record.deletions, 1);
    assert.match(await readFile(result.patchPath, "utf8"), /return a \+ b/);
    assert.match(await readFile(result.metadataPath, "utf8"), /code_exec_patch_test/);
    assert.match(await readFile(result.applyGuidePath, "utf8"), /did not run `git apply`/);

    const listed = await store.list({ executionId: "code_exec_patch_test" });
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.patchExportId, result.record.patchExportId);
    assert.match(formatPatchExportList(listed), /patch_export_/);
    assert.match(formatPatchExportRecord(result.record), /safeToApplyManually: true/);
  });

  it("marks deleted-file patches as not safe for manual apply", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "agentflow-patch-exports-"));
    const result = await new PatchExportStore(baseDir).save({
      executionId: "code_exec_delete_patch",
      sourceProjectPath: "/tmp/source-project",
      workspaceRoot: "/tmp/copied-workspace",
      patchText: "diff --git a/a b/a\n--- a/a\n+++ /dev/null\n-old\n",
      changedFiles: ["a"],
      filesAdded: [],
      filesModified: [],
      filesDeleted: ["a"],
      testStatus: "passed",
      verificationPass: true,
    });

    assert.equal(result.record.safeToApplyManually, false);
    assert.match(result.record.warnings.join("\n"), /deleted files/);
  });

  it("fails clearly when patch export id is missing", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "agentflow-patch-exports-"));
    await assert.rejects(() => new PatchExportStore(baseDir).get("missing"), /Patch export not found/);
  });
});
