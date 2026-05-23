import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { PolicyDecision } from "./ShellRiskClassifier.ts";
import type { NormalizedToolCall } from "./ToolCallHasher.ts";

export type PolicyAuditRecord = PolicyDecision & {
  decisionId: string;
  timestamp: string;
  toolName: string;
  toolArgs: unknown;
  command: string | null;
  toolCallHash: string | null;
  normalizedArgs: unknown;
  projectRoot: string;
  workflowRunId: string | null;
  sessionId: string | null;
  source: string;
  replayOfDecisionId?: string;
};

export class PolicyAuditLogger {
  readonly baseDir: string;

  constructor(baseDir = ".opencode/policy-runs") {
    this.baseDir = baseDir;
  }

  record(input: {
    decision: PolicyDecision;
    toolName: string;
    toolArgs?: unknown;
    command?: string | null;
    projectRoot: string;
    toolCallHash?: string | null;
    normalizedToolCall?: NormalizedToolCall | null;
    workflowRunId?: string | null;
    sessionId?: string | null;
    source?: string;
    replayOfDecisionId?: string;
  }): { record: PolicyAuditRecord; auditPath: string } {
    this.ensureDir();
    const record: PolicyAuditRecord = {
      decisionId: `policy_${randomUUID()}`,
      timestamp: new Date().toISOString(),
      action: input.decision.action,
      riskLevel: input.decision.riskLevel,
      reason: input.decision.reason,
      matchedRule: input.decision.matchedRule,
      affectedPaths: input.decision.affectedPaths,
      toolName: input.toolName,
      toolArgs: sanitize(input.toolArgs ?? {}),
      command: input.command ? redactSensitiveString(input.command) : null,
      toolCallHash: input.toolCallHash ?? null,
      normalizedArgs: sanitize(input.normalizedToolCall?.normalizedArgs ?? input.toolArgs ?? {}),
      projectRoot: input.projectRoot,
      workflowRunId: input.workflowRunId ?? null,
      sessionId: input.sessionId ?? null,
      source: input.source ?? "opencode-plugin",
      replayOfDecisionId: input.replayOfDecisionId,
    };

    const line = `${JSON.stringify(record)}\n`;
    appendFileSync(this.path("decisions.jsonl"), line, "utf8");
    appendFileSync(this.path(`${record.action === "allow" ? "allowed" : record.action === "ask" ? "asked" : "denied"}.jsonl`), line, "utf8");
    return { record, auditPath: this.path("decisions.jsonl") };
  }

  recent(options: { limit?: number; action?: "allow" | "ask" | "deny" } = {}): PolicyAuditRecord[] {
    const file = this.path("decisions.jsonl");
    let raw = "";
    try {
      raw = readFileSync(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const records = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as PolicyAuditRecord)
      .filter((record) => !options.action || record.action === options.action);
    return records.slice(-(options.limit ?? 20)).reverse();
  }

  ensureDir(): void {
    mkdirSync(this.baseDir, { recursive: true });
    mkdirSync(this.path("pending"), { recursive: true });
  }

  path(file: string): string {
    return join(this.baseDir, file);
  }
}

export function sanitize(value: unknown): unknown {
  if (typeof value === "string") return redactSensitiveString(truncate(value));
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
      output[key] = isSensitiveKey(key) ? "[REDACTED]" : sanitize(nested);
    }
    return output;
  }
  return value;
}

function truncate(value: string): string {
  return value.length > 1000 ? `${value.slice(0, 1000)}...[truncated]` : value;
}

function isSensitiveKey(key: string): boolean {
  return /(token|secret|password|api[_-]?key|private[_-]?key|credential)/i.test(key);
}

function redactSensitiveString(value: string): string {
  return value
    .replace(/(token|secret|password|api[_-]?key|private[_-]?key|credential)=([^\s;&|]+)/gi, "$1=[REDACTED]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]");
}

export function writeJsonFile(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
