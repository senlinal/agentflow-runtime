import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ExternalProjectWorkspaceRunner } from "./core/external/ExternalProjectWorkspaceRunner.ts";
import type { TaskBrief } from "./core/types.ts";

const sourceProjectPath = resolve("tests/fixtures/e2e-real-project");
const taskBrief = JSON.parse(await readFile("inputs/e2e-real-project-fix-task.json", "utf8")) as TaskBrief;
const fixedCalculator = [
  "export function add(a: number, b: number): number {",
  "  return a + b;",
  "}",
  "",
  "export function multiply(a: number, b: number): number {",
  "  return a * b;",
  "}",
  "",
].join("\n");

const result = await new ExternalProjectWorkspaceRunner().run({
  sourceProjectPath,
  targetFile: "src/calculator.ts",
  content: fixedCalculator,
  testCommands: ["npm run test"],
  taskBrief,
  allowedFiles: ["src/calculator.ts"],
  forbiddenFiles: ["src/string-utils.ts", ".env", ".env.local"],
});

console.log(JSON.stringify({
  importId: result.importedWorkspace.importId,
  sourceProjectPath: result.importedWorkspace.sourceProjectPath,
  workspaceRoot: result.importedWorkspace.workspaceRoot,
  copiedFilesCount: result.importedWorkspace.copiedFilesCount,
  excludedPaths: result.importedWorkspace.excludedPaths,
  initialTestStatus: result.initialTestStatus,
  finalTestStatus: result.finalTestStatus,
  changedFiles: result.changedFiles,
  patchPath: result.patchPath,
  patchExportId: result.patchExportId,
  patchHash: result.patchHash,
  patchMetadataPath: result.patchMetadataPath,
  patchApplyGuidePath: result.patchApplyGuidePath,
  executionId: result.executionId,
  executionRecordPath: result.executionRecordPath,
  rollbackGuidePath: result.rollbackGuidePath,
  summaryPath: result.summaryPath,
  tracePath: result.tracePath,
  sourceProjectModified: false,
  suggestedCommands: [
    "npm run execution:list",
    `npm run execution:show -- --id ${result.executionId ?? "<executionId>"}`,
    `npm run execution:rollback-guide -- --id ${result.executionId ?? "<executionId>"}`,
    "npm run patch:list",
    `npm run patch:show -- --id ${result.patchExportId ?? "<patchExportId>"}`,
    `npm run patch:apply-guide -- --id ${result.patchExportId ?? "<patchExportId>"}`,
  ],
}, null, 2));
