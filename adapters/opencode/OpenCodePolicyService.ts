import { FileOperationClassifier, type FileOperation } from "./FileOperationClassifier.ts";
import { OpenCodeSessionFileTracker } from "./OpenCodeSessionFileTracker.ts";
import { PolicyApprovalStore } from "./PolicyApprovalStore.ts";
import { PolicyAuditLogger } from "./PolicyAuditLogger.ts";
import { ShellRiskClassifier, type PolicyDecision } from "./ShellRiskClassifier.ts";
import { ToolCallHasher } from "./ToolCallHasher.ts";

export type OpenCodeToolCall = {
  tool: string;
  name?: string;
  args?: Record<string, unknown>;
  input?: Record<string, unknown>;
};

export type OpenCodePolicyDecision = PolicyDecision & {
  decisionId: string;
  timestamp: string;
  requiresApproval: boolean;
  auditPath: string;
  pendingApprovalPath?: string;
  replayApprovalId?: string;
  replayConsumed?: boolean;
};

export class OpenCodePolicyService {
  private readonly shell: ShellRiskClassifier;
  private readonly files: FileOperationClassifier;
  private readonly tracker: OpenCodeSessionFileTracker;
  private readonly auditLogger: PolicyAuditLogger;
  private readonly approvalStore: PolicyApprovalStore;
  private readonly projectRoot: string;

  constructor(
    projectRoot = process.cwd(),
    tracker = new OpenCodeSessionFileTracker(projectRoot),
    auditLogger = new PolicyAuditLogger(),
    approvalStore = new PolicyApprovalStore(auditLogger.baseDir),
  ) {
    this.projectRoot = projectRoot;
    this.tracker = tracker;
    this.shell = new ShellRiskClassifier(projectRoot, tracker);
    this.files = new FileOperationClassifier(projectRoot, tracker);
    this.auditLogger = auditLogger;
    this.approvalStore = approvalStore;
  }

  evaluateToolCall(call: OpenCodeToolCall): OpenCodePolicyDecision {
    const toolName = (call.tool || call.name || "").toLowerCase();
    const args = call.args ?? call.input ?? {};
    const rawToolName = call.tool || call.name || "unknown";
    const replayApprovalId = replayIdFromArgs(args);

    if (["bash", "shell", "exec", "exec_command"].some((name) => toolName.includes(name))) {
      return this.withAudit(this.evaluateBashCommand(String(args.command ?? args.cmd ?? "")), rawToolName, args, replayApprovalId);
    }

    if (["edit", "write", "apply_patch", "delete"].some((name) => toolName.includes(name))) {
      return this.withAudit(this.evaluateFileOperation(toFileOperation(toolName, args)), rawToolName, args, replayApprovalId);
    }

    if (toolName.includes("read") || toolName.includes("grep") || toolName.includes("search")) {
      return this.withAudit(
        { action: "allow", riskLevel: "low", reason: "Read-only tool call.", matchedRule: "read-only-tool", affectedPaths: [] },
        rawToolName,
        args,
        replayApprovalId,
      );
    }

    return this.withAudit(
      { action: "allow", riskLevel: "low", reason: "No high-risk tool rule matched.", matchedRule: "default-tool-allow", affectedPaths: [] },
      rawToolName,
      args,
      replayApprovalId,
    );
  }

  evaluateBashCommand(command: string): PolicyDecision {
    return this.shell.classify(command);
  }

  evaluateFileOperation(operation: FileOperation): PolicyDecision {
    return this.files.classify(operation);
  }

  isProjectPath(path: string): boolean {
    return this.evaluateFileOperation({ type: "modify", path }).matchedRule !== "file-external-path";
  }

  isKnownTemporaryFile(path: string): boolean {
    return this.tracker.isCreatedInSession(path);
  }

  registerCreatedFile(path: string): void {
    this.tracker.markCreated(path);
  }

  registerDeletedFile(path: string): void {
    this.tracker.markDeleted(path);
  }

  approvalStoreForTests(): PolicyApprovalStore {
    return this.approvalStore;
  }

  private withAudit(
    decision: PolicyDecision,
    toolName: string,
    toolArgs: Record<string, unknown>,
    replayApprovalId?: string,
  ): OpenCodePolicyDecision {
    const command = typeof toolArgs.command === "string"
      ? toolArgs.command
      : typeof toolArgs.cmd === "string"
        ? toolArgs.cmd
        : null;
    const { hash: toolCallHash, normalized } = ToolCallHasher.hash({
      toolName,
      toolArgs: withoutReplayFields(toolArgs),
      command,
      affectedPaths: decision.affectedPaths,
      projectRoot: this.projectRoot,
    });
    if (replayApprovalId) {
      const replay = this.approvalStore.consumeForReplay(replayApprovalId, {
        toolCallHash,
        normalizedToolCall: normalized,
      });
      if (replay.allowed) {
        const replayDecision: PolicyDecision = {
          action: "allow",
          riskLevel: "low",
          reason: replay.reason,
          matchedRule: "approval-replay",
          affectedPaths: decision.affectedPaths,
        };
        const { record, auditPath } = this.auditLogger.record({
          decision: replayDecision,
          toolName,
          toolArgs: withoutReplayFields(toolArgs),
          command,
          projectRoot: this.projectRoot,
          toolCallHash,
          normalizedToolCall: normalized,
          workflowRunId: typeof toolArgs.workflowRunId === "string" ? toolArgs.workflowRunId : null,
          sessionId: typeof toolArgs.sessionId === "string" ? toolArgs.sessionId : null,
          source: "opencode-plugin-replay",
          replayOfDecisionId: replayApprovalId,
        });
        return {
          ...replayDecision,
          decisionId: record.decisionId,
          timestamp: record.timestamp,
          requiresApproval: false,
          auditPath,
          replayApprovalId,
          replayConsumed: true,
        };
      }
      const deniedReplay: PolicyDecision = {
        action: "deny",
        riskLevel: "high",
        reason: replay.reason,
        matchedRule: "approval-replay-integrity-failed",
        affectedPaths: decision.affectedPaths,
      };
      const { record, auditPath } = this.auditLogger.record({
        decision: deniedReplay,
        toolName,
        toolArgs: withoutReplayFields(toolArgs),
        command,
        projectRoot: this.projectRoot,
        toolCallHash,
        normalizedToolCall: normalized,
        workflowRunId: typeof toolArgs.workflowRunId === "string" ? toolArgs.workflowRunId : null,
        sessionId: typeof toolArgs.sessionId === "string" ? toolArgs.sessionId : null,
        source: "opencode-plugin-replay",
        replayOfDecisionId: replayApprovalId,
      });
      return {
        ...deniedReplay,
        decisionId: record.decisionId,
        timestamp: record.timestamp,
        requiresApproval: false,
        auditPath,
        replayApprovalId,
        replayConsumed: false,
      };
    }
    const { record, auditPath } = this.auditLogger.record({
      decision,
      toolName,
      toolArgs: withoutReplayFields(toolArgs),
      command,
      projectRoot: this.projectRoot,
      toolCallHash,
      normalizedToolCall: normalized,
      workflowRunId: typeof toolArgs.workflowRunId === "string" ? toolArgs.workflowRunId : null,
      sessionId: typeof toolArgs.sessionId === "string" ? toolArgs.sessionId : null,
      source: "opencode-plugin",
    });

    let pendingApprovalPath: string | undefined;
    if (decision.action === "ask") {
      pendingApprovalPath = this.approvalStore.createPending(record).path;
    }

    return {
      ...decision,
      decisionId: record.decisionId,
      timestamp: record.timestamp,
      requiresApproval: decision.action === "ask",
      auditPath,
      pendingApprovalPath,
    };
  }
}

function replayIdFromArgs(args: Record<string, unknown>): string | undefined {
  for (const key of ["approvalId", "policyApprovalId", "replayDecisionId", "approvedDecisionId"]) {
    if (typeof args[key] === "string") return args[key] as string;
  }
  return undefined;
}

function withoutReplayFields(args: Record<string, unknown>): Record<string, unknown> {
  const output = { ...args };
  delete output.approvalId;
  delete output.policyApprovalId;
  delete output.replayDecisionId;
  delete output.approvedDecisionId;
  return output;
}

function toFileOperation(toolName: string, args: Record<string, unknown>): FileOperation {
  const path = stringArg(args, ["path", "file", "filePath", "target"]);
  const paths = arrayArg(args, ["paths", "files"]);
  const patch = stringArg(args, ["patch", "diff"]);
  if (toolName.includes("apply_patch")) return { type: "apply_patch", path, paths, patch };
  if (toolName.includes("delete")) return { type: "delete", path, paths, patch };
  if (toolName.includes("write")) return { type: "write", path, paths, patch };
  return { type: "edit", path, paths, patch };
}

function stringArg(args: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof args[key] === "string") return args[key];
  }
  return undefined;
}

function arrayArg(args: Record<string, unknown>, keys: string[]): string[] | undefined {
  for (const key of keys) {
    if (Array.isArray(args[key])) return args[key].filter((item): item is string => typeof item === "string");
  }
  return undefined;
}
