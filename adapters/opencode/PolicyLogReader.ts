import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type PolicyLogWarning = {
  filePath: string;
  line?: number;
  message: string;
};

export type JsonlReadResult<T = Record<string, unknown>> = {
  records: T[];
  warnings: PolicyLogWarning[];
};

export type PolicyRunsReadResult = {
  decisions: Record<string, unknown>[];
  approvals: Record<string, unknown>[];
  replays: Record<string, unknown>[];
  pending: Record<string, unknown>[];
  warnings: PolicyLogWarning[];
};

export class PolicyLogReader {
  readJsonl<T = Record<string, unknown>>(filePath: string): JsonlReadResult<T> {
    if (!existsSync(filePath)) return { records: [], warnings: [] };
    const records: T[] = [];
    const warnings: PolicyLogWarning[] = [];
    const lines = readFileSync(filePath, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (!line.trim()) return;
      try {
        records.push(JSON.parse(line) as T);
      } catch (error) {
        warnings.push({
          filePath,
          line: index + 1,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
    return { records, warnings };
  }

  readPendingApprovals(rootDir: string): JsonlReadResult<Record<string, unknown>> {
    const pendingDir = join(rootDir, "pending");
    if (!existsSync(pendingDir)) return { records: [], warnings: [] };
    const records: Record<string, unknown>[] = [];
    const warnings: PolicyLogWarning[] = [];
    for (const file of readdirSync(pendingDir).filter((item) => item.endsWith(".json"))) {
      const filePath = join(pendingDir, file);
      try {
        records.push(JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>);
      } catch (error) {
        warnings.push({
          filePath,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { records, warnings };
  }

  readPolicyRuns(rootDir = ".opencode/policy-runs"): PolicyRunsReadResult {
    const decisions = this.readJsonl(join(rootDir, "decisions.jsonl"));
    const approvals = this.readJsonl(join(rootDir, "approvals.jsonl"));
    const replays = this.readJsonl(join(rootDir, "replays.jsonl"));
    const pending = this.readPendingApprovals(rootDir);
    return {
      decisions: decisions.records,
      approvals: approvals.records,
      replays: replays.records,
      pending: pending.records,
      warnings: [...decisions.warnings, ...approvals.warnings, ...replays.warnings, ...pending.warnings],
    };
  }
}
