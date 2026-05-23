import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { ExternalProjectImporter } from "../core/external/ExternalProjectImporter.ts";
import { ExternalProjectWorkspaceRunner } from "../core/external/ExternalProjectWorkspaceRunner.ts";
import type { TaskBrief } from "../core/types.ts";

describe("ExternalProjectImporter", () => {
  it("copies an external project to a temporary workspace and excludes runtime artifacts", async () => {
    const source = await createExternalProjectFixture();
    await mkdir(join(source, "node_modules/pkg"), { recursive: true });
    await mkdir(join(source, ".git"), { recursive: true });
    await mkdir(join(source, ".agentflow/executions"), { recursive: true });
    await writeFile(join(source, ".env"), "SECRET=hidden\n", "utf8");
    await writeFile(join(source, "node_modules/pkg/index.js"), "module.exports = 1;\n", "utf8");
    await writeFile(join(source, ".agentflow/executions/record.json"), "{}\n", "utf8");

    const imported = await new ExternalProjectImporter().importProject({ sourceProjectPath: source });

    assert.ok(imported.importId.startsWith("external_import_"));
    assert.equal(imported.sourceProjectPath, await realpath(source));
    assert.ok(imported.copiedFilesCount >= 4);
    assert.ok(imported.excludedPaths.some((path) => path.startsWith("node_modules")));
    assert.ok(imported.excludedPaths.some((path) => path.startsWith(".git")));
    assert.ok(imported.excludedPaths.some((path) => path === ".env"));
    await assert.rejects(() => readFile(join(imported.workspaceRoot, ".env"), "utf8"), /ENOENT/);
  });

  it("refuses the current repository root by default", async () => {
    await assert.rejects(
      () => new ExternalProjectImporter().importProject({ sourceProjectPath: process.cwd() }),
      /Refusing to import the current repository root/,
    );
  });

  it("runs a scoped workspace execution without modifying the source project", async () => {
    const source = await createExternalProjectFixture();
    const originalCalculator = await readFile(join(source, "src/calculator.ts"), "utf8");
    const originalStringUtils = await readFile(join(source, "src/string-utils.ts"), "utf8");
    const recordStoreDir = await mkdtemp(join(tmpdir(), "agentflow-external-records-"));
    const externalRunBaseDir = await mkdtemp(join(tmpdir(), "agentflow-external-runs-"));
    const taskBrief = taskBriefFixture();

    const result = await new ExternalProjectWorkspaceRunner().run({
      sourceProjectPath: source,
      targetFile: "src/calculator.ts",
      content: fixedCalculatorContent(),
      testCommands: ["npm run test"],
      taskBrief,
      allowedFiles: ["src/calculator.ts"],
      forbiddenFiles: ["src/string-utils.ts", ".env", ".env.local"],
      executionRecordBaseDir: recordStoreDir,
      externalRunBaseDir,
    });

    assert.equal(result.initialTestStatus, "failed");
    assert.equal(result.finalTestStatus, "passed");
    assert.deepEqual(result.changedFiles, ["src/calculator.ts"]);
    assert.ok(result.patchPath.endsWith("changes.patch"));
    assert.ok(result.executionId);
    assert.equal(result.finalContext.verification?.pass, true);
    assert.equal(await readFile(join(source, "src/calculator.ts"), "utf8"), originalCalculator);
    assert.equal(await readFile(join(source, "src/string-utils.ts"), "utf8"), originalStringUtils);
    assert.match(await readFile(result.patchPath, "utf8"), /return a \+ b/);
    assert.equal(result.finalContext.codeChangePlanExecutionRecord?.rollbackGuide?.destructiveRollbackPerformed, false);
  });
});

async function createExternalProjectFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "agentflow-external-source-"));
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "tests"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({
    type: "module",
    scripts: {
      test: "node --experimental-strip-types tests/calculator.test.js && node --experimental-strip-types tests/string-utils.test.js",
    },
  }, null, 2), "utf8");
  await writeFile(join(root, "src/calculator.ts"), [
    "export function add(a: number, b: number): number {",
    "  return a - b;",
    "}",
    "",
  ].join("\n"), "utf8");
  await writeFile(join(root, "src/string-utils.ts"), [
    "export function reverse(value: string): string {",
    "  return value.split('').reverse().join('');",
    "}",
    "",
  ].join("\n"), "utf8");
  await writeFile(join(root, "tests/calculator.test.js"), [
    "import assert from 'node:assert/strict';",
    "import { add } from '../src/calculator.ts';",
    "assert.equal(add(1, 2), 3);",
    "",
  ].join("\n"), "utf8");
  await writeFile(join(root, "tests/string-utils.test.js"), [
    "import assert from 'node:assert/strict';",
    "import { reverse } from '../src/string-utils.ts';",
    "assert.equal(reverse('abc'), 'cba');",
    "",
  ].join("\n"), "utf8");
  return root;
}

function taskBriefFixture(): TaskBrief {
  return {
    taskId: "external_project_test",
    goal: "Fix calculator.add in a copied external project workspace.",
    currentState: "calculator.add subtracts.",
    constraints: ["Only modify src/calculator.ts.", "Do not modify source project.", "Run npm test."],
    resources: ["testCommands: [\"npm run test\"]"],
    budget: "low",
    successCriteria: ["npm test passes.", "Only src/calculator.ts changes.", "No files deleted."],
    nonGoals: ["No writeback to source project.", "No real LLM."],
  };
}

function fixedCalculatorContent(): string {
  return [
    "export function add(a: number, b: number): number {",
    "  return a + b;",
    "}",
    "",
  ].join("\n");
}
