import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { PatchExportStore } from "../core/patch/PatchExportStore.ts";
import { formatPatchVerificationResult, PatchVerifier } from "../core/patch/PatchVerifier.ts";

describe("PatchVerifier", () => {
  it("passes a safe patch export without executing apply", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "agentflow-patch-verify-"));
    const saved = await createPatchExport(baseDir, safePatch());

    const result = await new PatchVerifier().verify(saved.record);

    assert.equal(result.status, "passed");
    assert.equal(result.patchHashMatched, true);
    assert.deepEqual(result.checkedFiles, ["src/calculator.ts"]);
    assert.equal(result.manualReviewRequired, true);
    assert.match(formatPatchVerificationResult(result), /does not run git apply/);
  });

  it("fails when patch hash does not match current patch file", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "agentflow-patch-verify-"));
    const saved = await createPatchExport(baseDir, safePatch());
    await writeFile(saved.patchPath, `${await readFile(saved.patchPath, "utf8")}\n+tampered\n`, "utf8");

    const result = await new PatchVerifier().verify(saved.record);

    assert.equal(result.status, "failed");
    assert.equal(result.patchHashMatched, false);
    assert.match(result.blockedReasons.join("\n"), /patchHash/);
  });

  it("fails for deleted files", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "agentflow-patch-verify-"));
    const saved = await createPatchExport(baseDir, "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ /dev/null\n-old\n", {
      changedFiles: ["a.txt"],
      filesModified: [],
      filesDeleted: ["a.txt"],
    });

    const result = await new PatchVerifier().verify(saved.record);

    assert.equal(result.status, "failed");
    assert.match(result.blockedReasons.join("\n"), /deletes file/);
  });

  it("fails for forbidden and sensitive paths", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "agentflow-patch-verify-"));
    const saved = await createPatchExport(baseDir, [
      "diff --git a/.env b/.env",
      "--- a/.env",
      "+++ b/.env",
      "@@ -1 +1 @@",
      "-A=1",
      "+A=2",
      "",
    ].join("\n"), {
      changedFiles: [".env"],
      filesModified: [".env"],
    });

    const result = await new PatchVerifier().verify(saved.record, { forbiddenFiles: [".env"] });

    assert.equal(result.status, "failed");
    assert.match(result.blockedReasons.join("\n"), /forbidden file/);
    assert.match(result.blockedReasons.join("\n"), /sensitive path/);
  });

  it("fails when patch touches files outside metadata changedFiles", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "agentflow-patch-verify-"));
    const saved = await createPatchExport(baseDir, [
      "diff --git a/src/other.ts b/src/other.ts",
      "--- a/src/other.ts",
      "+++ b/src/other.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "",
    ].join("\n"), {
      changedFiles: ["src/calculator.ts"],
      filesModified: ["src/calculator.ts"],
    });

    const result = await new PatchVerifier().verify(saved.record);

    assert.equal(result.status, "failed");
    assert.match(result.blockedReasons.join("\n"), /not listed in metadata/);
  });

  it("fails for dangerous command content", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "agentflow-patch-verify-"));
    const saved = await createPatchExport(baseDir, [
      "diff --git a/scripts/run.sh b/scripts/run.sh",
      "--- a/scripts/run.sh",
      "+++ b/scripts/run.sh",
      "@@ -1 +1 @@",
      "-echo ok",
      "+rm -rf /",
      "",
    ].join("\n"), {
      changedFiles: ["scripts/run.sh"],
      filesModified: ["scripts/run.sh"],
    });

    const result = await new PatchVerifier().verify(saved.record);

    assert.equal(result.status, "failed");
    assert.match(result.blockedReasons.join("\n"), /dangerous command/);
  });

  it("fails clearly when patch file is missing", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "agentflow-patch-verify-"));
    const saved = await createPatchExport(baseDir, safePatch());
    saved.record.patchPath = join(baseDir, "missing.patch");

    const result = await new PatchVerifier().verify(saved.record);

    assert.equal(result.status, "failed");
    assert.match(result.blockedReasons.join("\n"), /patch file does not exist/);
  });
});

function safePatch(): string {
  return [
    "diff --git a/src/calculator.ts b/src/calculator.ts",
    "--- a/src/calculator.ts",
    "+++ b/src/calculator.ts",
    "@@ -1,3 +1,3 @@",
    " export function add(a: number, b: number): number {",
    "-  return a - b;",
    "+  return a + b;",
    " }",
    "",
  ].join("\n");
}

async function createPatchExport(
  baseDir: string,
  patchText: string,
  overrides: Partial<Parameters<PatchExportStore["save"]>[0]> = {},
): Promise<Awaited<ReturnType<PatchExportStore["save"]>>> {
  return new PatchExportStore(baseDir).save({
    executionId: "code_exec_patch_verify",
    sourceProjectPath: "/tmp/source-project",
    workspaceRoot: "/tmp/copied-workspace",
    patchText,
    changedFiles: ["src/calculator.ts"],
    filesAdded: [],
    filesModified: ["src/calculator.ts"],
    filesDeleted: [],
    testStatus: "passed",
    verificationPass: true,
    ...overrides,
  });
}
