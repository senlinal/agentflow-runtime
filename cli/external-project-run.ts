import { readFile } from "node:fs/promises";
import { parseArgs } from "./args.ts";
import { ExternalProjectWorkspaceRunner } from "../core/external/ExternalProjectWorkspaceRunner.ts";
import type { TaskBrief } from "../core/types.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.source) throw new Error("external-project:run requires --source <projectPath>.");
if (!args.target) throw new Error("external-project:run requires --target <relativeFilePath>.");
if (!args.contentFile) throw new Error("external-project:run requires --contentFile <path>.");

const content = await readFile(args.contentFile, "utf8");
const testCommands = (args.testCommand ?? "npm run test").split(",").map((item) => item.trim()).filter(Boolean);
const taskBrief: TaskBrief = args.input
  ? JSON.parse(await readFile(args.input, "utf8")) as TaskBrief
  : {
      taskId: "external_project_scoped_run",
      goal: `Apply a scoped change to ${args.target} in a copied external project workspace.`,
      currentState: "An external source project path was provided by the user.",
      constraints: ["Copy project to a temporary workspace.", "Do not modify the source project.", "Do not delete files."],
      resources: [`testCommands: ${JSON.stringify(testCommands)}`],
      budget: "low",
      successCriteria: ["Configured tests pass.", `Only ${args.target} changes.`, "No files deleted."],
      nonGoals: ["Do not write changes back to the source project.", "Do not call a real LLM."],
    };

const result = await new ExternalProjectWorkspaceRunner().run({
  sourceProjectPath: args.source,
  targetFile: args.target,
  content,
  testCommands,
  taskBrief,
  allowedFiles: args.allowedFiles ? args.allowedFiles.split(",").map((item) => item.trim()).filter(Boolean) : [args.target],
  forbiddenFiles: args.forbiddenFiles ? args.forbiddenFiles.split(",").map((item) => item.trim()).filter(Boolean) : undefined,
  allowCurrentRepoRoot: args.allowCurrentRepoRoot === "true",
});

process.stdout.write(`${JSON.stringify({
  importId: result.importedWorkspace.importId,
  sourceProjectPath: result.importedWorkspace.sourceProjectPath,
  workspaceRoot: result.importedWorkspace.workspaceRoot,
  copiedFilesCount: result.importedWorkspace.copiedFilesCount,
  excludedPaths: result.importedWorkspace.excludedPaths,
  initialTestStatus: result.initialTestStatus,
  finalTestStatus: result.finalTestStatus,
  changedFiles: result.changedFiles,
  patchPath: result.patchPath,
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
  ],
}, null, 2)}\n`);
