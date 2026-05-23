import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CodeChangePlanExecutionRecord, RollbackGuide } from "../types.ts";
import { truncateAndRedact } from "../SecretRedactor.ts";

export type ExecutionRecordSummary = {
  executionId: string;
  status: CodeChangePlanExecutionRecord["status"];
  codeChangePlanId: string;
  approvalId: string;
  verificationPass: boolean | null;
  consumedApproval: boolean;
  startedAt: string;
  finishedAt?: string;
  rollbackGuideId?: string;
  executionRecordPath: string;
  rollbackGuidePath?: string;
};

export type ExecutionRecordFilters = {
  status?: CodeChangePlanExecutionRecord["status"];
  codeChangePlanId?: string;
  approvalId?: string;
  verificationPass?: boolean;
  limit?: number;
};

export type ExecutionRecordStoreSaveResult = {
  record: CodeChangePlanExecutionRecord;
  summary: ExecutionRecordSummary;
  executionRecordPath: string;
  rollbackGuidePath?: string;
};

export class ExecutionRecordStore {
  private readonly baseDir: string;

  constructor(baseDir = ".agentflow/executions") {
    this.baseDir = baseDir;
  }

  async save(record: CodeChangePlanExecutionRecord): Promise<ExecutionRecordStoreSaveResult> {
    await this.ensureDirs();
    const rollbackGuideId = record.rollbackGuide ? `rollback_${record.executionId}` : undefined;
    const executionRecordPath = join(this.baseDir, "records", `${record.executionId}.json`);
    const rollbackGuidePath = rollbackGuideId ? join(this.baseDir, "rollback-guides", `${rollbackGuideId}.json`) : undefined;
    const storedRollbackGuide = record.rollbackGuide && rollbackGuideId
      ? sanitizeRollbackGuide({
          ...record.rollbackGuide,
          rollbackId: rollbackGuideId,
          destructiveRollbackAvailable: false,
          reason: record.rollbackGuide.reason ?? "Automatic destructive rollback is intentionally disabled.",
        })
      : undefined;
    const storedRecord = sanitizeRecord({
      ...record,
      rollbackGuide: storedRollbackGuide,
      rollbackGuideId,
      executionRecordPath,
      ...(rollbackGuidePath ? { rollbackGuidePath } : {}),
    });
    const summary = toSummary(storedRecord);

    await writeFile(executionRecordPath, `${JSON.stringify(storedRecord, null, 2)}\n`, "utf8");
    if (storedRollbackGuide && rollbackGuidePath) {
      await writeFile(
        rollbackGuidePath,
        `${JSON.stringify({
          executionId: record.executionId,
          rollbackId: rollbackGuideId,
          destructiveRollbackAvailable: false,
          ...storedRollbackGuide,
        }, null, 2)}\n`,
        "utf8",
      );
    }
    await appendFile(join(this.baseDir, "records.jsonl"), `${JSON.stringify(summary)}\n`, "utf8");
    return { record: storedRecord, summary, executionRecordPath, rollbackGuidePath };
  }

  async list(filters: ExecutionRecordFilters = {}): Promise<ExecutionRecordSummary[]> {
    await this.ensureDirs();
    const text = await readFile(join(this.baseDir, "records.jsonl"), "utf8").catch((error: unknown) => {
      if (isNotFound(error)) return "";
      throw error;
    });
    const summaries = text
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line, index) => {
        try {
          return JSON.parse(line) as ExecutionRecordSummary;
        } catch (error) {
          throw new Error(`Failed to parse execution record summary at records.jsonl:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
        }
      })
      .filter((item) => !filters.status || item.status === filters.status)
      .filter((item) => !filters.codeChangePlanId || item.codeChangePlanId === filters.codeChangePlanId)
      .filter((item) => !filters.approvalId || item.approvalId === filters.approvalId)
      .filter((item) => filters.verificationPass === undefined || item.verificationPass === filters.verificationPass)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return typeof filters.limit === "number" ? summaries.slice(0, filters.limit) : summaries;
  }

  async get(executionId: string): Promise<CodeChangePlanExecutionRecord> {
    const path = join(this.baseDir, "records", `${executionId}.json`);
    const text = await readFile(path, "utf8").catch((error: unknown) => {
      if (isNotFound(error)) throw new Error(`Execution record not found: ${executionId}`);
      throw error;
    });
    return JSON.parse(text) as CodeChangePlanExecutionRecord;
  }

  async getRollbackGuide(executionId: string): Promise<RollbackGuide & { executionId?: string }> {
    const record = await this.get(executionId);
    if (!record.rollbackGuideId) throw new Error(`Rollback guide not found for execution record: ${executionId}`);
    const path = record.rollbackGuidePath ?? join(this.baseDir, "rollback-guides", `${record.rollbackGuideId}.json`);
    const text = await readFile(path, "utf8").catch((error: unknown) => {
      if (isNotFound(error)) throw new Error(`Rollback guide not found for execution record: ${executionId}`);
      throw error;
    });
    return JSON.parse(text) as RollbackGuide & { executionId?: string };
  }

  async allRecordIds(): Promise<string[]> {
    await this.ensureDirs();
    const files = await readdir(join(this.baseDir, "records")).catch((error: unknown) => {
      if (isNotFound(error)) return [];
      throw error;
    });
    return files.filter((file) => file.endsWith(".json")).map((file) => file.replace(/\.json$/, ""));
  }

  private async ensureDirs(): Promise<void> {
    await mkdir(join(this.baseDir, "records"), { recursive: true });
    await mkdir(join(this.baseDir, "rollback-guides"), { recursive: true });
  }
}

function toSummary(record: CodeChangePlanExecutionRecord): ExecutionRecordSummary {
  return {
    executionId: record.executionId,
    status: record.status,
    codeChangePlanId: record.codeChangePlanId,
    approvalId: record.approvalId,
    verificationPass: typeof record.verification?.pass === "boolean" ? record.verification.pass : null,
    consumedApproval: record.consumedApproval,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    rollbackGuideId: record.rollbackGuideId,
    executionRecordPath: record.executionRecordPath ?? "",
    rollbackGuidePath: record.rollbackGuidePath,
  };
}

function sanitizeRecord(record: CodeChangePlanExecutionRecord): CodeChangePlanExecutionRecord {
  return sanitizeUnknown(record) as CodeChangePlanExecutionRecord;
}

function sanitizeRollbackGuide(guide: RollbackGuide): RollbackGuide {
  return sanitizeUnknown(guide) as RollbackGuide;
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === "string") return truncateAndRedact(value, 8_000);
  if (Array.isArray(value)) return value.map(sanitizeUnknown);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = key === "rawOutput" && typeof item === "string"
      ? truncateAndRedact(item, 4_000)
      : sanitizeUnknown(item);
  }
  return result;
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT");
}
