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
  const finalStatus = context.stopReason
    ? "stopped"
    : context.codeChangePlanExecutionRecord
    ? `code-change-plan-${context.codeChangePlanExecutionRecord.status}`
    : context.codeChangePlanDryRunExecutionPlan?.status === "planned"
    ? "execution-dry-run-planned"
    : context.codeChangePlanExecutionApprovalRequest?.status === "pending"
    ? "execution-approval-pending"
    : context.codeChangePlan
    ? "code-change-plan-materialized"
    : context.humanApprovalRequest?.status === "pending"
    ? "approval-pending"
    : verification?.pass
    ? "passed"
    : "not-passed";
  const executionResult = context.executionResult ?? context.testExecutionResult ?? context.codeExecutionResult;
  const executionStarted = Boolean(executionResult);
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
    buildExecutionVerificationSummary(context),
    buildRepairSummary(context),
    buildCodeChangeExecutionApprovalSummary(context),
    buildCodeChangeDryRunSummary(context),
    buildCodeChangeExecutionSummary(context),
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
          `- codeExecutionResult: ${context.codeExecutionResult?.summary ?? "n/a"}`,
          `- testExecutionResult: ${context.testExecutionResult?.summary ?? "n/a"}`,
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
    executionResult?.summary ?? "No execution result.",
    "",
  ].join("\n");
}

function buildRepairSummary(context: WorkflowContext): string {
  if (!context.scopedRepairPlan && !context.humanApprovalRequest && !context.codeChangePlan) return "";
  return [
    "## Scoped Repair / Approval",
    "",
    context.scopedRepairPlan
      ? [
          `- repairPlanId: ${context.scopedRepairPlan.planId}`,
          `- riskLevel: ${context.scopedRepairPlan.riskLevel}`,
          `- requiresHumanApproval: ${context.scopedRepairPlan.requiresHumanApproval}`,
          `- failureCodes: ${context.scopedRepairPlan.basedOnFailureCodes.join("; ") || "none"}`,
          `- targetFiles: ${context.scopedRepairPlan.targetFiles.join("; ") || "none"}`,
          `- forbiddenFiles: ${context.scopedRepairPlan.forbiddenFiles.join("; ") || "none"}`,
          `- proposedOperations: ${context.scopedRepairPlan.proposedOperations.map((item) => `${item.id}:${item.type}`).join("; ") || "none"}`,
          `- proposedOperationCount: ${context.scopedRepairPlan.proposedOperations.length}`,
          `- safetyNotes: ${context.scopedRepairPlan.safetyNotes.join("; ") || "none"}`,
        ].join("\n")
      : "- repairPlan: n/a",
    context.humanApprovalRequest
      ? [
          `- approvalId: ${context.humanApprovalRequest.approvalId}`,
          `- approvalStatus: ${context.humanApprovalRequest.status}`,
          `- blockedUntilApproved: ${context.humanApprovalRequest.blockedUntilApproved}`,
        ].join("\n")
      : "- approval: n/a",
    context.repairApprovalRecord
      ? [
          `- repairApprovalStatus: ${context.repairApprovalRecord.status}`,
          `- repairApprovalId: ${context.repairApprovalRecord.approvalId}`,
          `- approvedAt: ${context.repairApprovalRecord.approvedAt ?? "n/a"}`,
        ].join("\n")
      : "",
    context.codeChangePlan
      ? [
          "",
          "## CodeChangePlan Summary",
          "",
          `- codeChangePlanId: ${context.codeChangePlan.planId}`,
          `- sourceRepairPlanId: ${context.codeChangePlan.repairPlanId}`,
          `- codeChangePlanStatus: ${context.codeChangePlan.status}`,
          `- operationsCount: ${context.codeChangePlan.operations.length}`,
          `- expectedFilesChanged: ${context.codeChangePlan.targetFiles.join("; ") || "none"}`,
          `- testCommands: ${context.codeChangePlan.testCommands.join("; ") || "none"}`,
          `- safetyNotes: ${context.codeChangePlan.safetyChecks.join("; ") || "none"}`,
          `- codeChangePlanExecutable: ${context.codeChangePlan.executable}`,
          `- codeChangeOperations: ${context.codeChangePlan.operations.map((item) => `${item.id}:${item.type}`).join("; ") || "none"}`,
          `- blockedOperations: ${context.codeChangePlan.blockedOperations.join("; ") || "none"}`,
          `- requiresExplicitExecutionApproval: ${context.codeChangePlan.requiresExplicitExecutionApproval}`,
        ].join("\n")
      : "",
    "",
    "CodeChangePlan was materialized only.",
    "No repair was executed automatically.",
    "No repair operations were executed automatically.",
    "Materialized code change plans are not executed automatically.",
    "Explicit execution approval is required before applying this plan.",
    "Human approval is required before applying any repair.",
    "",
  ].join("\n");
}

function buildCodeChangeExecutionApprovalSummary(context: WorkflowContext): string {
  const request = context.codeChangePlanExecutionApprovalRequest;
  if (!request) return "";
  return [
    "## CodeChangePlan Execution Approval",
    "",
    `- approvalId: ${request.approvalId}`,
    `- codeChangePlanId: ${request.codeChangePlanId}`,
    `- codeChangePlanHash: ${request.codeChangePlanHash}`,
    `- approvalStatus: ${request.status}`,
    `- requestedAction: ${request.requestedAction}`,
    `- blockedUntilApproved: ${request.blockedUntilApproved}`,
    `- requiresExplicitExecutionApproval: ${request.requiresExplicitExecutionApproval}`,
    `- riskLevel: ${request.riskLevel}`,
    `- operationsCount: ${request.operationsCount}`,
    `- targetFiles: ${request.targetFiles.join("; ") || "none"}`,
    `- expectedFilesChanged: ${request.targetFiles.join("; ") || "none"}`,
    `- testCommands: ${request.testCommands.join("; ") || "none"}`,
    "- safetyFindings: none",
    "- nextAllowedActions: review request; approve or reject execution approval out of band; do not execute while pending",
    `- reason: ${request.reason}`,
    "",
    "Execution approval request was created only.",
    "No CodeChangePlan operations were executed automatically.",
    "CodeChangePlan execution was not performed.",
    "Explicit human approval is required before executing this plan.",
    "Pending execution approval is not an execution authorization.",
    "",
  ].join("\n");
}

function buildCodeChangeDryRunSummary(context: WorkflowContext): string {
  const plan = context.codeChangePlanDryRunExecutionPlan;
  if (!plan) return "";
  return [
    "## CodeChangePlan Execution Dry-run",
    "",
    `- dryRunId: ${plan.dryRunId}`,
    `- codeChangePlanId: ${plan.codeChangePlanId}`,
    `- codeChangePlanHash: ${plan.codeChangePlanHash}`,
    `- approvalId: ${plan.approvalId}`,
    `- approvalStatus: ${plan.approvalStatus}`,
    `- status: ${plan.status}`,
    `- hashMatched: ${plan.hashMatched}`,
    `- mode: ${plan.mode}`,
    `- riskLevel: ${plan.riskLevel}`,
    `- operationsCount: ${plan.operations.length}`,
    `- targetFiles: ${plan.targetFiles.join("; ") || "none"}`,
    `- expectedFilesChanged: ${plan.expectedFilesChanged.join("; ") || "none"}`,
    `- testCommands: ${plan.testCommands.join("; ") || "none"}`,
    `- safetyFindings: ${plan.safetyChecks.join("; ") || "none"}`,
    `- blockedReasons: ${plan.blockedReasons.join("; ") || "none"}`,
    `- wouldWriteFiles: ${plan.wouldWriteFiles}`,
    `- wouldRunCommands: ${plan.wouldRunCommands}`,
    `- wouldRunTests: ${plan.wouldRunTests}`,
    `- wouldCallCodeExecutor: ${plan.wouldCallCodeExecutor}`,
    `- consumesApproval: ${plan.consumesApproval}`,
    `- requiresExecuteFlag: ${plan.requiresExecuteFlag}`,
    `- requiresSeparateExecutionStep: ${plan.requiresSeparateExecutionStep}`,
    "",
    "Dry-run only. No files were written.",
    "No CodeChangePlan operations were executed.",
    "No commands were executed.",
    "No tests were run.",
    "CodeExecutor was not called.",
    "Approval was not consumed.",
    "Use an explicit execution step to apply this plan.",
    "",
  ].join("\n");
}

function buildCodeChangeExecutionSummary(context: WorkflowContext): string {
  const record = context.codeChangePlanExecutionRecord;
  if (!record) return "";
  const blocked = record.status === "blocked";
  return [
    "## CodeChangePlan Execution",
    "",
    `- executionId: ${record.executionId}`,
    `- codeChangePlanId: ${record.codeChangePlanId}`,
    `- approvalId: ${record.approvalId}`,
    `- codeChangePlanHash: ${record.codeChangePlanHash}`,
    `- hashMatched: ${record.hashMatched}`,
    `- status: ${record.status}`,
    `- checkpointId: ${record.checkpointId ?? "none"}`,
    `- consumedApproval: ${record.consumedApproval}`,
    `- codeExecutionStatus: ${record.codeExecutionResult?.status ?? "n/a"}`,
    `- testExecutionStatus: ${record.testExecutionResult?.status ?? "n/a"}`,
    `- verificationPass: ${record.verification?.pass ?? "n/a"}`,
    `- blockedReasons: ${record.blockedReasons.join("; ") || "none"}`,
    `- safetyFindings: ${record.safetyFindings.join("; ") || "none"}`,
    `- rollbackGuide.summary: ${record.rollbackGuide?.summary ?? "none"}`,
    `- rollbackGuide.changedFiles: ${record.rollbackGuide?.changedFiles.join("; ") || "none"}`,
    `- rollbackGuide.destructiveRollbackPerformed: ${record.rollbackGuide?.destructiveRollbackPerformed ?? "n/a"}`,
    "",
    blocked
      ? "Execution was blocked. No files were modified."
      : "CodeChangePlan was executed under explicit approval.",
    blocked ? "" : "Execution approval was consumed.",
    blocked ? "" : "A checkpoint was created before file writes.",
    blocked ? "" : "Configured tests were run after file writes.",
    blocked ? "" : "Execution-aware verification was run after tests.",
    "Rollback guide is non-destructive.",
    "No automatic destructive rollback was performed.",
    "",
  ].join("\n");
}

function buildExecutionVerificationSummary(context: WorkflowContext): string {
  const evidence = context.runtimeMetadata?.executionVerification;
  if (!evidence) return "";
  return [
    "## Execution Verification Evidence",
    "",
    `- codeStatus: ${stringValue(evidence.codeStatus)}`,
    `- testStatus: ${stringValue(evidence.testStatus)}`,
    `- checkpointId: ${stringValue(evidence.checkpointId)}`,
    `- filesChanged: ${arrayValue(evidence.filesChanged).join("; ") || "none"}`,
    `- filesDeleted: ${arrayValue(evidence.filesDeleted).join("; ") || "none"}`,
    `- failedCommands: ${arrayValue(evidence.failedCommands).join("; ") || "none"}`,
    `- blockedOperations: ${arrayValue(evidence.blockedOperations).join("; ") || "none"}`,
    `- safetyFindings: ${arrayValue(evidence.safetyFindings).join("; ") || "none"}`,
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
