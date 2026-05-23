import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { WorkflowContext } from "./types.ts";

export type TraceStoreResult = {
  runId: string;
  runDir: string;
  tracePath: string;
  contextPath: string;
  summaryPath: string;
};

export class TraceStore {
  static async save(
    context: WorkflowContext,
    options: { workflowName?: string; templateVersion?: string; baseDir?: string } = {},
  ): Promise<TraceStoreResult> {
    const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
    const baseDir = options.baseDir ?? ".workflow-runs";
    const runDir = join(baseDir, runId);
    await mkdir(runDir, { recursive: true });

    const tracePath = join(runDir, "trace.json");
    const contextPath = join(runDir, "context.json");
    const summaryPath = join(runDir, "summary.md");

    await writeFile(tracePath, `${JSON.stringify(context.trace, null, 2)}\n`, "utf8");
    await writeFile(contextPath, `${JSON.stringify(context, null, 2)}\n`, "utf8");
    await writeFile(
      summaryPath,
      buildSummary(context, runId, options.workflowName ?? "unknown", options.templateVersion ?? "unknown"),
      "utf8",
    );

    return { runId, runDir, tracePath, contextPath, summaryPath };
  }
}

function buildSummary(context: WorkflowContext, runId: string, workflowName: string, templateVersion: string): string {
  const verification = context.verification;
  const feasibility = context.feasibilityReport;
  const finalStatus = context.stopReason ? "stopped" : verification?.pass ? "passed" : "not-passed";
  const executionStarted = Boolean(context.executionResult);
  return [
    `# Workflow Run ${runId}`,
    "",
    `- workflow: ${workflowName}`,
    `- templateVersion: ${templateVersion}`,
    `- runId: ${runId}`,
    `- finalStatus: ${finalStatus}`,
    `- taskId: ${context.taskId}`,
    `- userGoal: ${context.userGoal}`,
    `- stopReason: ${context.stopReason ?? "none"}`,
    `- verification.pass: ${verification?.pass ?? "n/a"}`,
    `- verification.score: ${verification?.score ?? "n/a"}`,
    `- totalSteps: ${context.trace.length}`,
    `- decision: ${feasibility?.decision ?? "n/a"}`,
    `- costLevel: ${feasibility?.costLevel ?? "n/a"}`,
    `- riskLevel: ${feasibility?.riskLevel ?? "n/a"}`,
    "",
    "## TaskBrief",
    "",
    context.taskBrief
      ? [
          `- goal: ${context.taskBrief.goal}`,
          `- currentState: ${context.taskBrief.currentState}`,
          `- budget: ${context.taskBrief.budget}`,
          `- nonGoals: ${context.taskBrief.nonGoals.join("; ")}`,
        ].join("\n")
      : "No TaskBrief.",
    "",
    "## ResearchReport",
    "",
    context.researchReport
      ? [
          `- summary: ${context.researchReport.summary}`,
          `- recommendedNextStep: ${context.researchReport.recommendedNextStep}`,
          `- risks: ${context.researchReport.risks.join("; ")}`,
        ].join("\n")
      : "No ResearchReport.",
    "",
    "## FeasibilityReport",
    "",
    feasibility
      ? [
          `- feasibility: ${feasibility.feasibility}`,
          `- decision: ${feasibility.decision}`,
          `- confidence: ${feasibility.confidence}`,
          `- costLevel: ${feasibility.costLevel}`,
          `- complexityLevel: ${feasibility.complexityLevel}`,
          `- riskLevel: ${feasibility.riskLevel}`,
          `- recommendedScope: ${feasibility.recommendedScope}`,
          `- alternativePlans: ${feasibility.alternativePlans.join("; ")}`,
          `- reason: ${feasibility.reason}`,
        ].join("\n")
      : "No FeasibilityReport.",
    "",
    buildLlmMetadataSummary(context),
    "",
    !executionStarted && feasibility
      ? [
          "## Execution Gate",
          "",
          "Execution did not continue into Planner/Executor.",
          `Reason: ${feasibility.reason}`,
          `Cost/Risk: cost=${feasibility.costLevel}, risk=${feasibility.riskLevel}, complexity=${feasibility.complexityLevel}`,
          `Recommended alternative: ${feasibility.alternativePlans[0] ?? feasibility.recommendedScope}`,
          "",
        ].join("\n")
      : "",
    executionStarted
      ? [
          "## Execution Result",
          "",
          `- plan: ${context.plan?.summary ?? "n/a"}`,
          `- executionResult: ${context.executionResult?.summary ?? "n/a"}`,
          `- verification: pass=${verification?.pass ?? "n/a"}, score=${verification?.score ?? "n/a"}`,
          "",
        ].join("\n")
      : "",
    "## Trace",
    "",
    ...context.trace.map(
      (item) => `- ${item.step}. ${item.nodeId} / ${item.role} -> ${item.nextNode}: ${item.outputSummary}`,
    ),
    "",
    "## Final Result",
    "",
    context.executionResult?.summary ?? "No execution result.",
    "",
  ].join("\n");
}

function buildLlmMetadataSummary(context: WorkflowContext): string {
  const summary = context.runtimeMetadata?.llmConfigSummary;
  const calls = context.runtimeMetadata?.llmCalls ?? [];
  if (!summary && calls.length === 0) return "";

  const configLines = summary
    ? [
        "## LLM Config",
        "",
        `- provider: ${stringValue(summary.provider)}`,
        `- model: ${stringValue(summary.model)}`,
        `- baseURL: ${stringValue(summary.baseURL)}`,
        `- hasApiKey: ${stringValue(summary.hasApiKey)}`,
        `- timeoutMs: ${stringValue(summary.timeoutMs)}`,
        `- maxRetries: ${stringValue(summary.maxRetries)}`,
        `- warnings: ${arrayValue(summary.warnings).join("; ") || "none"}`,
      ]
    : [];

  const callLines = calls.length > 0
    ? [
        "",
        "## LLM Calls",
        "",
        ...calls.map((call, index) =>
          [
            `- ${index + 1}. nodeId=${stringValue(call.nodeId)}`,
            `provider=${stringValue(call.provider)}`,
            `model=${stringValue(call.model)}`,
            `attempts=${stringValue(call.attempts)}`,
            `outputSchema=${stringValue(call.outputSchemaName)}`,
            `success=${stringValue(call.success)}`,
            `warnings=${arrayValue(call.warnings).join("; ") || "none"}`,
          ].join(", ")
        ),
      ]
    : [];

  return [...configLines, ...callLines].join("\n");
}

function stringValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "n/a";
  return String(value);
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}
