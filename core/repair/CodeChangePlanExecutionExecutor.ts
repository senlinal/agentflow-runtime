import { randomUUID } from "node:crypto";
import type {
  AgentNode,
  CodeChangeOperation,
  CodeChangePlan,
  CodeChangePlanExecutionApprovalRecord,
  CodeChangePlanExecutionRecord,
  ExecutionResult,
  NodeExecutor,
  RollbackGuide,
  VerificationReport,
  WorkflowContext,
} from "../types.ts";
import { CodeExecutor } from "../execution/CodeExecutor.ts";
import { TestExecutor } from "../execution/TestExecutor.ts";
import { ExecutionVerifier } from "../verification/ExecutionVerifier.ts";
import { hashCodeChangePlan } from "./CodeChangePlanHasher.ts";

const SENSITIVE_PATH_PATTERN = /(^|\/)\.env($|\.)|\.pem$|\.key$|token|credential|secret/i;
const UNSAFE_COMMAND_PATTERN = /[;&|`$<>]|\brm\b|\bsudo\b|\bcurl\b.*\|\s*(sh|bash)|\bwget\b.*\|\s*(sh|bash)|git\s+(reset\s+--hard|clean\s+-[fdx]+)/i;

export class CodeChangePlanExecutionRunner {
  private readonly codeExecutor: CodeExecutor;
  private readonly testExecutor: TestExecutor;
  private readonly verifier: ExecutionVerifier;

  constructor(options: {
    codeExecutor?: CodeExecutor;
    testExecutor?: TestExecutor;
    verifier?: ExecutionVerifier;
  } = {}) {
    this.codeExecutor = options.codeExecutor ?? new CodeExecutor();
    this.testExecutor = options.testExecutor ?? new TestExecutor();
    this.verifier = options.verifier ?? new ExecutionVerifier();
  }

  async executeApprovedPlan(
    context: WorkflowContext,
    options: { executorConfig?: Record<string, unknown>; now?: Date } = {},
  ): Promise<CodeChangePlanExecutionRecord> {
    const now = options.now ?? new Date();
    const startedAt = now.toISOString();
    const executionId = `code_exec_${randomUUID().slice(0, 12)}`;
    const plan = context.codeChangePlan;
    const approval = context.codeChangePlanExecutionApprovalRecord;
    if (!plan) {
      return blockedRecord(executionId, "", "", "", startedAt, ["CodeChangePlan is missing."], []);
    }
    if (!approval) {
      return blockedRecord(executionId, plan.planId, "", hashCodeChangePlan(plan), startedAt, ["CodeChangePlanExecutionApprovalRecord is missing."], []);
    }

    const safety = validateExecutablePlan(plan, approval, now);
    if (safety.blockedReasons.length > 0) {
      return blockedRecord(executionId, plan.planId, approval.approvalId, hashCodeChangePlan(plan), startedAt, safety.blockedReasons, safety.safetyFindings);
    }

    const codeNode = buildCodeNode(plan, options.executorConfig);
    const testNode = buildTestNode(plan, options.executorConfig);
    let codeExecutionResult: ExecutionResult | undefined;
    let testExecutionResult: ExecutionResult | undefined;
    let verification: VerificationReport | undefined;
    let rollbackGuide: RollbackGuide | undefined;
    let checkpointId: string | undefined;

    try {
      codeExecutionResult = await this.codeExecutor.execute(codeNode, context);
      context.codeExecutionResult = codeExecutionResult;
      checkpointId = extractCheckpointId(codeExecutionResult);
      testExecutionResult = await this.testExecutor.execute(testNode, context);
      context.testExecutionResult = testExecutionResult;
      const verificationResult = this.verifier.verify(context);
      verification = verificationResult.report;
      context.verification = verification;
      context.runtimeMetadata = {
        ...context.runtimeMetadata,
        executionVerification: verificationResult.evidence as unknown as Record<string, unknown>,
      };
      rollbackGuide = buildRollbackGuide(checkpointId, codeExecutionResult);
      approval.status = "consumed";
      approval.consumedAt = new Date().toISOString();
      approval.consumedByExecutionId = executionId;
      return {
        executionId,
        codeChangePlanId: plan.planId,
        approvalId: approval.approvalId,
        codeChangePlanHash: hashCodeChangePlan(plan),
        hashMatched: true,
        status: verification.pass ? "executed" : "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        checkpointId,
        consumedApproval: true,
        codeExecutionResult,
        testExecutionResult,
        verification,
        rollbackGuide,
        blockedReasons: [],
        safetyFindings: safety.safetyFindings,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rollbackGuide = buildRollbackGuide(checkpointId, codeExecutionResult);
      approval.status = "consumed";
      approval.consumedAt = new Date().toISOString();
      approval.consumedByExecutionId = executionId;
      return {
        executionId,
        codeChangePlanId: plan.planId,
        approvalId: approval.approvalId,
        codeChangePlanHash: hashCodeChangePlan(plan),
        hashMatched: true,
        status: "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        checkpointId,
        consumedApproval: true,
        ...(codeExecutionResult ? { codeExecutionResult } : {}),
        ...(testExecutionResult ? { testExecutionResult } : {}),
        ...(verification ? { verification } : {}),
        rollbackGuide,
        blockedReasons: [message],
        safetyFindings: safety.safetyFindings,
      };
    }
  }
}

export class CodeChangePlanExecutionExecutor implements NodeExecutor {
  private readonly runner: CodeChangePlanExecutionRunner;

  constructor(runner = new CodeChangePlanExecutionRunner()) {
    this.runner = runner;
  }

  async execute(node: AgentNode, context: WorkflowContext): Promise<unknown> {
    return this.runner.executeApprovedPlan(context, { executorConfig: node.executorConfig });
  }
}

function validateExecutablePlan(
  plan: CodeChangePlan,
  approval: CodeChangePlanExecutionApprovalRecord,
  now: Date,
): { blockedReasons: string[]; safetyFindings: string[] } {
  const blockedReasons: string[] = [];
  const safetyFindings: string[] = [];
  const hash = hashCodeChangePlan(plan);
  if (approval.codeChangePlanId !== plan.planId) blockedReasons.push(`approval codeChangePlanId does not match CodeChangePlan: ${approval.codeChangePlanId}`);
  if (approval.requestedAction !== "approve_code_change_plan_execution") blockedReasons.push(`approval requestedAction is invalid: ${approval.requestedAction}`);
  if (approval.status !== "approved") blockedReasons.push(`approval must be approved before execution; got ${approval.status}`);
  if (approval.expiresAt && new Date(approval.expiresAt).getTime() <= now.getTime()) blockedReasons.push("approval is expired");
  if (hash !== approval.codeChangePlanHash) blockedReasons.push(`CodeChangePlan hash mismatch: expected ${approval.codeChangePlanHash}, got ${hash}`);
  if (plan.blockedOperations.length > 0) blockedReasons.push(`CodeChangePlan has blocked operations: ${plan.blockedOperations.join("; ")}`);
  if (plan.operations.length === 0) blockedReasons.push("CodeChangePlan requires at least one operation.");
  if (!plan.requiresExplicitExecutionApproval) blockedReasons.push("CodeChangePlan requiresExplicitExecutionApproval must be true.");
  if (plan.executable !== false) blockedReasons.push("CodeChangePlan executable must remain false; execution is controlled by this explicit runner.");
  for (const operation of plan.operations) {
    validateOperation(operation, plan, blockedReasons, safetyFindings);
  }
  if (blockedReasons.length === 0) {
    safetyFindings.push("approval is approved and single-use");
    safetyFindings.push("CodeChangePlan hash matches approval record");
    safetyFindings.push("execution scope remains within CodeChangePlan targetFiles and testCommands");
  }
  return { blockedReasons, safetyFindings };
}

function validateOperation(
  operation: CodeChangeOperation,
  plan: CodeChangePlan,
  blockedReasons: string[],
  safetyFindings: string[],
): void {
  if ((operation.type as string) === "delete_file") {
    blockedReasons.push(`${operation.id}: delete_file is not supported`);
    return;
  }
  if ((operation.type === "create_file" || operation.type === "modify_file") && typeof operation.content !== "string") {
    blockedReasons.push(`${operation.id}: ${operation.type} requires explicit content`);
  }
  if (operation.targetFile) {
    if (!plan.targetFiles.includes(operation.targetFile)) blockedReasons.push(`${operation.id}: targetFile is outside targetFiles: ${operation.targetFile}`);
    if (plan.forbiddenFiles.includes(operation.targetFile) || SENSITIVE_PATH_PATTERN.test(operation.targetFile)) {
      blockedReasons.push(`${operation.id}: targetFile is forbidden or sensitive: ${operation.targetFile}`);
    }
    safetyFindings.push(`${operation.id}: targetFile is scoped`);
  }
  if (operation.command) {
    if (!plan.testCommands.includes(operation.command)) blockedReasons.push(`${operation.id}: command is outside testCommands: ${operation.command}`);
    if (UNSAFE_COMMAND_PATTERN.test(operation.command)) blockedReasons.push(`${operation.id}: command is high risk: ${operation.command}`);
    safetyFindings.push(`${operation.id}: command is scoped`);
  }
}

function buildCodeNode(plan: CodeChangePlan, executorConfig: Record<string, unknown> = {}): AgentNode {
  const fileWrites = plan.operations
    .filter((operation) => operation.type === "create_file" || operation.type === "modify_file")
    .map((operation) => ({
      path: operation.targetFile ?? "",
      content: operation.content ?? "",
      overwrite: operation.type === "modify_file",
    }));
  return {
    id: "codeChangePlanControlledCodeExecutor",
    type: "code",
    role: "CodeExecutor",
    description: "Apply approved CodeChangePlan file operations under controlled execution.",
    inputKeys: ["codeChangePlan", "codeChangePlanExecutionApprovalRecord"],
    outputKey: "codeExecutionResult",
    outputSchema: "CodeExecutionResult",
    executorConfig: {
      ...executorConfig,
      fileWrites,
      commands: [],
      maxFilesChanged: typeof executorConfig.maxFilesChanged === "number" ? executorConfig.maxFilesChanged : Math.max(1, plan.targetFiles.length),
      allowFileCreate: true,
      allowFileModify: true,
      allowFileDelete: false,
    },
  };
}

function buildTestNode(plan: CodeChangePlan, executorConfig: Record<string, unknown> = {}): AgentNode {
  return {
    id: "codeChangePlanControlledTestRunner",
    type: "test",
    role: "TestRunner",
    description: "Run approved CodeChangePlan test commands after controlled execution.",
    inputKeys: ["codeChangePlan", "codeExecutionResult"],
    outputKey: "testExecutionResult",
    outputSchema: "TestExecutionResult",
    executorConfig: {
      projectRoot: executorConfig.projectRoot,
      cwd: executorConfig.cwd,
      timeoutMs: executorConfig.timeoutMs,
      commands: plan.testCommands,
    },
  };
}

function blockedRecord(
  executionId: string,
  codeChangePlanId: string,
  approvalId: string,
  codeChangePlanHash: string,
  startedAt: string,
  blockedReasons: string[],
  safetyFindings: string[],
): CodeChangePlanExecutionRecord {
  return {
    executionId,
    codeChangePlanId,
    approvalId,
    codeChangePlanHash,
    hashMatched: true,
    status: "blocked",
    startedAt,
    finishedAt: new Date().toISOString(),
    consumedApproval: false,
    blockedReasons,
    safetyFindings,
  };
}

function extractCheckpointId(result?: ExecutionResult): string | undefined {
  if (!result) return undefined;
  try {
    const raw = JSON.parse(result.rawOutput) as { checkpoint?: { checkpointId?: unknown } };
    return typeof raw.checkpoint?.checkpointId === "string" ? raw.checkpoint.checkpointId : undefined;
  } catch {
    return undefined;
  }
}

function buildRollbackGuide(checkpointId: string | undefined, result?: ExecutionResult): RollbackGuide {
  return {
    checkpointId,
    summary: "No automatic destructive rollback was performed. Review changed files and use the checkpoint evidence to manually revert if needed.",
    changedFiles: result?.artifacts ?? [],
    manualSteps: [
      "Inspect codeExecutionResult.rawOutput diff evidence.",
      "Review changed files before applying any manual revert.",
      "Use version control or the checkpoint status as guidance; do not run destructive rollback automatically.",
    ],
    destructiveRollbackPerformed: false,
  };
}
