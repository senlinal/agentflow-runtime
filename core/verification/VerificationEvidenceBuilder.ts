import type {
  CodeExecutionResult,
  CodingTaskContext,
  TaskBrief,
  TestExecutionResult,
  WorkflowContext,
} from "../types.ts";

export type VerificationEvidence = {
  executedOperations: string[];
  blockedOperations: string[];
  codeStatus: "success" | "failed" | "missing";
  testStatus: "passed" | "failed" | "missing";
  failedCommands: string[];
  filesChanged: string[];
  filesAdded: string[];
  filesModified: string[];
  filesDeleted: string[];
  checkpointId: string | null;
  commandResults: unknown[];
  diffSummary: {
    filesChanged: string[];
    patchSize: number;
    stat: string;
  };
  safetyFindings: string[];
  taskBrief: TaskBrief | null;
  codingTaskContext: CodingTaskContext | null;
};

export class VerificationEvidenceBuilder {
  static build(context: WorkflowContext): VerificationEvidence {
    const codeRaw = parseRaw(context.codeExecutionResult?.rawOutput);
    const testRaw = parseRaw(context.testExecutionResult?.rawOutput);
    const diff = asRecord(codeRaw.diff);
    const statusEntries = arrayOfRecords(diff.statusEntries);
    const filesChanged = stringArray(codeRaw.filesChangedByExecutor).length > 0
      ? stringArray(codeRaw.filesChangedByExecutor)
      : stringArray(diff.filesChanged);
    const commandResults = [
      ...arrayOfRecords(codeRaw.commandResults),
      ...arrayOfRecords(testRaw.commands),
    ];
    const failedCommands = commandResults
      .filter((item) => item.timedOut === true || (typeof item.exitCode === "number" && item.exitCode !== 0))
      .map((item) => commandDisplay(item));

    return {
      executedOperations: [
        ...(context.codeExecutionResult?.completedSteps ?? []),
        ...(context.testExecutionResult?.completedSteps ?? []),
      ],
      blockedOperations: [
        ...blockedFromErrors(context.codeExecutionResult),
        ...blockedFromErrors(context.testExecutionResult),
      ],
      codeStatus: inferCodeStatus(context.codeExecutionResult),
      testStatus: inferTestStatus(context.testExecutionResult),
      failedCommands,
      filesChanged,
      filesAdded: filesByStatus(statusEntries, ["??", "A"]),
      filesModified: filesByStatus(statusEntries, ["M"]),
      filesDeleted: filesByStatus(statusEntries, ["D"]),
      checkpointId: typeof asRecord(codeRaw.checkpoint).checkpointId === "string"
        ? asRecord(codeRaw.checkpoint).checkpointId
        : null,
      commandResults,
      diffSummary: {
        filesChanged,
        patchSize: typeof diff.patchPreview === "string" ? diff.patchPreview.length : 0,
        stat: typeof diff.stat === "string" ? diff.stat : "",
      },
      safetyFindings: safetyFindings(filesChanged),
      taskBrief: context.taskBrief,
      codingTaskContext: context.codingTaskContext ?? null,
    };
  }
}

function parseRaw(rawOutput: string | undefined): Record<string, unknown> {
  if (!rawOutput) return {};
  try {
    const parsed = JSON.parse(rawOutput) as unknown;
    return asRecord(parsed);
  } catch {
    return {};
  }
}

function inferCodeStatus(result: CodeExecutionResult | null): VerificationEvidence["codeStatus"] {
  if (!result) return "missing";
  if (result.status === "success" || result.status === "failed") return result.status;
  return result.errors.length === 0 ? "success" : "failed";
}

function inferTestStatus(result: TestExecutionResult | null): VerificationEvidence["testStatus"] {
  if (!result) return "missing";
  if (result.status === "passed") return "passed";
  if (result.status === "failed") return "failed";
  return result.errors.length === 0 ? "passed" : "failed";
}

function blockedFromErrors(result: CodeExecutionResult | TestExecutionResult | null): string[] {
  return (result?.errors ?? []).filter((error) =>
    /refusing|disabled|outside|sensitive|not allowed|blocked/i.test(error)
  );
}

function safetyFindings(files: string[]): string[] {
  return files.filter((file) => /\.(env|pem|key)$/i.test(file) || /token|credential|secret/i.test(file));
}

function filesByStatus(entries: Array<Record<string, unknown>>, statuses: string[]): string[] {
  return entries
    .filter((entry) => statuses.some((status) => String(entry.status).includes(status)))
    .map((entry) => String(entry.path))
    .filter(Boolean);
}

function commandDisplay(record: Record<string, unknown>): string {
  const command = typeof record.command === "string" ? record.command : "unknown";
  const args = Array.isArray(record.args) ? record.args.map(String) : [];
  return [command, ...args].join(" ");
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
