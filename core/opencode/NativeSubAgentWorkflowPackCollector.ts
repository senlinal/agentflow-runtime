import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SchemaValidator } from "../SchemaValidator.ts";
import type { NativeSubAgentTask, NativeSubAgentWorkflowPack, OutputSchemaName } from "../types.ts";
import type { ProfileRoleTimelineEvent } from "../profile/ProfileWorkflowRunner.ts";
import { manifestPathForRun } from "./NativeSubAgentWorkflowPackBuilder.ts";

export type NativeSubAgentCollectResult = {
  runId: string;
  manifestPath: string;
  status: NativeSubAgentWorkflowPack["status"];
  roleTimeline: ProfileRoleTimelineEvent[];
  completedCount: number;
  pendingCount: number;
  failedCount: number;
  summaryPath: string;
  tracePath: string;
  missingOutputs: Array<{ role: string; outputArtifactPath: string }>;
  warnings: string[];
};

export class NativeSubAgentWorkflowPackCollector {
  async collect(input: { runId: string; baseRunDir?: string }): Promise<NativeSubAgentCollectResult> {
    const manifestPath = manifestPathForRun(input.runId, input.baseRunDir);
    const pack = JSON.parse(await readFile(manifestPath, "utf8")) as NativeSubAgentWorkflowPack;
    const roleTimeline: ProfileRoleTimelineEvent[] = [];
    const missingOutputs: Array<{ role: string; outputArtifactPath: string }> = [];
    const warnings: string[] = [];

    for (const task of pack.tasks) {
      const outputExists = await exists(task.outputArtifactPath);
      if (!outputExists) {
        missingOutputs.push({ role: task.role, outputArtifactPath: task.outputArtifactPath });
        roleTimeline.push(toTimeline(task, "pending", "output artifact not found"));
        task.status = "pending";
        continue;
      }
      try {
        const output = JSON.parse(await readFile(task.outputArtifactPath, "utf8")) as unknown;
        SchemaValidator.validate(task.expectedOutputSchema as OutputSchemaName, output);
        roleTimeline.push(toTimeline(task, "completed", "validated output artifact"));
        task.status = "completed";
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`${task.role} output failed validation: ${message}`);
        roleTimeline.push(toTimeline(task, "failed", message));
        task.status = "failed";
      }
    }

    const completedCount = pack.tasks.filter((task) => task.status === "completed").length;
    const pendingCount = pack.tasks.filter((task) => task.status === "pending" || task.status === "ready").length;
    const failedCount = pack.tasks.filter((task) => task.status === "failed").length;
    pack.status = failedCount > 0 ? "failed" : completedCount === pack.tasks.length ? "completed" : "partially_completed";

    const tracePath = join(pack.artifactRoot, "trace.json");
    const summaryPath = join(pack.artifactRoot, "summary.md");
    await writeFile(manifestPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
    await writeFile(tracePath, `${JSON.stringify(roleTimeline, null, 2)}\n`, "utf8");
    await writeFile(summaryPath, `${formatSummary(pack, roleTimeline, missingOutputs, warnings)}\n`, "utf8");

    return {
      runId: pack.runId,
      manifestPath,
      status: pack.status,
      roleTimeline,
      completedCount,
      pendingCount,
      failedCount,
      summaryPath,
      tracePath,
      missingOutputs,
      warnings,
    };
  }
}

function toTimeline(task: NativeSubAgentTask, status: ProfileRoleTimelineEvent["status"], summary: string): ProfileRoleTimelineEvent {
  return {
    nodeId: task.taskId,
    role: task.role,
    openCodeSubAgentName: task.openCodeAgentName,
    openCodeAgentName: task.openCodeAgentName,
    status,
    summary,
    outputSchema: task.expectedOutputSchema,
    source: "opencode_native_artifact",
    inputArtifactPath: task.inputArtifactPath,
    outputArtifactPath: task.outputArtifactPath,
    isMock: false,
    isLLMBacked: false,
    openCodeNativeSubAgent: status === "completed",
    nativeDispatchStatus: status === "completed" ? "completed" : status,
  };
}

function formatSummary(
  pack: NativeSubAgentWorkflowPack,
  timeline: ProfileRoleTimelineEvent[],
  missing: Array<{ role: string; outputArtifactPath: string }>,
  warnings: string[],
): string {
  return [
    "# AgentFlow Native Subagent Collect Summary",
    "",
    `runId: ${pack.runId}`,
    `status: ${pack.status}`,
    "",
    "## Role Timeline",
    "",
    ...timeline.map((event) => [
      `${event.role}`,
      `  source: ${event.source}`,
      `  openCodeAgentName: ${event.openCodeAgentName}`,
      `  input: ${event.inputArtifactPath}`,
      `  output: ${event.outputArtifactPath}`,
      `  status: ${event.status}`,
      `  reason: ${event.summary}`,
    ].join("\n")),
    "",
    "## Missing Outputs",
    "",
    ...(missing.length === 0 ? ["none"] : missing.map((item) => `- ${item.role}: ${item.outputArtifactPath}`)),
    "",
    "## Warnings",
    "",
    ...(warnings.length === 0 ? ["none"] : warnings.map((item) => `- ${item}`)),
  ].join("\n");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
