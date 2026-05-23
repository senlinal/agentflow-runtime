import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ApprovalReplayService, type ReplayPlan } from "./ApprovalReplayService.ts";
import { PolicyApprovalStore } from "./PolicyApprovalStore.ts";
import { sanitize } from "./PolicyAuditLogger.ts";
import { ShellRiskClassifier } from "./ShellRiskClassifier.ts";
import { ToolCallHasher } from "./ToolCallHasher.ts";

export type PolicyReplayResult = {
  replayId: string;
  originalDecisionId: string;
  mode: "dry-run" | "execute";
  status: "planned" | "executed" | "failed" | "blocked" | "unsupported";
  plan: ReplayPlan;
  exitCode: number | null;
  stdoutPreview: string;
  stderrPreview: string;
  reason: string;
  replayLogPath: string;
};

export class PolicyReplayRunner {
  private readonly replay: ApprovalReplayService;
  private readonly approvals: PolicyApprovalStore;
  private readonly baseDir: string;

  constructor(
    approvals = new PolicyApprovalStore(),
    replay = new ApprovalReplayService(approvals),
    baseDir = approvals.baseDir,
  ) {
    this.approvals = approvals;
    this.replay = replay;
    this.baseDir = baseDir;
  }

  async run(decisionId: string, options: { execute?: boolean; timeoutMs?: number } = {}): Promise<PolicyReplayResult> {
    const replayId = `replay_${randomUUID()}`;
    const plan = this.replay.buildReplayPlan(decisionId);
    const mode = options.execute ? "execute" : "dry-run";

    if (!options.execute) {
      return this.record({
        replayId,
        originalDecisionId: decisionId,
        mode,
        status: "planned",
        plan,
        exitCode: null,
        stdoutPreview: "",
        stderrPreview: "",
        reason: plan.replayable ? "Dry-run only. Pass --execute to run the original approved tool call." : plan.reason,
      });
    }

    if (!plan.replayable || !plan.normalizedToolCall) {
      return this.record(blocked(replayId, decisionId, mode, plan, plan.reason));
    }
    if (!isBashTool(plan.toolName ?? "")) {
      return this.record(blocked(replayId, decisionId, mode, plan, "Only bash tool replay is supported in this version.", "unsupported"));
    }

    const recalculated = ToolCallHasher.hash({
      toolName: plan.normalizedToolCall.toolName,
      toolArgs: plan.normalizedToolCall.normalizedArgs,
      command: plan.normalizedToolCall.command,
      affectedPaths: plan.normalizedToolCall.affectedPaths,
      projectRoot: plan.normalizedToolCall.projectRoot,
    });
    if (recalculated.hash !== plan.toolCallHash) {
      return this.record(blocked(replayId, decisionId, mode, plan, "Replay hash verification failed."));
    }

    const command = plan.normalizedToolCall.command;
    if (!command) return this.record(blocked(replayId, decisionId, mode, plan, "Approved bash replay has no command."));

    const risk = new ShellRiskClassifier(plan.normalizedToolCall.projectRoot).classify(command);
    if (risk.action === "deny") return this.record(blocked(replayId, decisionId, mode, plan, `Replay command is denied by current policy: ${risk.reason}`));

    const execution = await executeShell(command, plan.normalizedToolCall.projectRoot, options.timeoutMs ?? 60_000);
    let consumedAt: string | null = null;
    if (execution.started) {
      const consumed = this.approvals.consumeForReplay(decisionId, {
        toolCallHash: plan.toolCallHash ?? "",
        normalizedToolCall: plan.normalizedToolCall,
      });
      consumedAt = consumed.approval.consumedAt ?? null;
    }
    const refreshedPlan = { ...this.replay.buildReplayPlan(decisionId), consumedAt };

    return this.record({
      replayId,
      originalDecisionId: decisionId,
      mode,
      status: execution.exitCode === 0 ? "executed" : "failed",
      plan: refreshedPlan,
      exitCode: execution.exitCode,
      stdoutPreview: redactPreview(execution.stdout),
      stderrPreview: redactPreview(execution.stderr),
      reason: execution.exitCode === 0 ? "Replay executed successfully." : execution.reason,
    });
  }

  private record(result: Omit<PolicyReplayResult, "replayLogPath">): PolicyReplayResult {
    mkdirSync(this.baseDir, { recursive: true });
    const replayLogPath = join(this.baseDir, "replays.jsonl");
    const line = {
      replayId: result.replayId,
      originalDecisionId: result.originalDecisionId,
      timestamp: new Date().toISOString(),
      mode: result.mode,
      status: result.status,
      toolCallHash: result.plan.toolCallHash,
      command: redactPreview(result.plan.command ?? ""),
      affectedPaths: result.plan.affectedPaths,
      exitCode: result.exitCode,
      stdoutPreview: result.stdoutPreview,
      stderrPreview: result.stderrPreview,
      reason: result.reason,
    };
    appendFileSync(replayLogPath, `${JSON.stringify(line)}\n`, "utf8");
    return { ...result, replayLogPath };
  }
}

function blocked(
  replayId: string,
  decisionId: string,
  mode: "execute",
  plan: ReplayPlan,
  reason: string,
  status: "blocked" | "unsupported" = "blocked",
): Omit<PolicyReplayResult, "replayLogPath"> {
  return {
    replayId,
    originalDecisionId: decisionId,
    mode,
    status,
    plan,
    exitCode: null,
    stdoutPreview: "",
    stderrPreview: "",
    reason,
  };
}

function isBashTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase();
  return ["bash", "shell", "exec", "exec_command"].some((name) => normalized.includes(name));
}

function executeShell(command: string, cwd: string, timeoutMs: number): Promise<{
  started: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  reason: string;
}> {
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", command], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let started = true;
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      stderr += "\n[policy replay timeout]";
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      started = false;
      clearTimeout(timer);
      resolve({ started, exitCode: null, stdout, stderr: `${stderr}${error.message}`, reason: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        started,
        exitCode: code,
        stdout,
        stderr,
        reason: code === 0 ? "Replay executed successfully." : `Replay command exited with code ${code}.`,
      });
    });
  });
}

function redactPreview(value: string): string {
  const sanitized = sanitize(value);
  const text = typeof sanitized === "string" ? sanitized : JSON.stringify(sanitized);
  return text.length > 2000 ? `${text.slice(0, 2000)}...[truncated]` : text;
}
