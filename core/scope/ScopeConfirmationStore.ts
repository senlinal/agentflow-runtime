import { mkdir, readFile, readdir, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { agentFlowPath } from "../AgentFlowPaths.ts";
import type { ScopeConfirmationRecord } from "../types.ts";

export type ScopeConfirmationListFilters = {
  status?: ScopeConfirmationRecord["status"];
  negotiationId?: string;
  limit?: number;
};

export class ScopeConfirmationStore {
  private readonly baseDir: string;

  constructor(baseDir = agentFlowPath(".agentflow/scope-confirmations")) {
    this.baseDir = baseDir;
  }

  async save(record: ScopeConfirmationRecord): Promise<{ recordPath: string }> {
    await mkdir(this.recordsDir(), { recursive: true });
    const recordPath = join(this.recordsDir(), `${record.confirmationId}.json`);
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await appendFile(join(this.baseDir, "records.jsonl"), `${JSON.stringify(summary(record))}\n`, "utf8");
    return { recordPath };
  }

  async list(filters: ScopeConfirmationListFilters = {}): Promise<ScopeConfirmationRecord[]> {
    await mkdir(this.recordsDir(), { recursive: true });
    const files = (await readdir(this.recordsDir())).filter((file) => file.endsWith(".json"));
    const records = await Promise.all(files.map((file) => this.get(file.replace(/\.json$/, ""))));
    return records
      .filter((record) => !filters.status || record.status === filters.status)
      .filter((record) => !filters.negotiationId || record.negotiationId === filters.negotiationId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, filters.limit ?? 20);
  }

  async get(confirmationId: string): Promise<ScopeConfirmationRecord> {
    try {
      const raw = await readFile(join(this.recordsDir(), `${confirmationId}.json`), "utf8");
      return JSON.parse(raw) as ScopeConfirmationRecord;
    } catch (error) {
      throw new Error(`Scope confirmation record not found: ${confirmationId}`);
    }
  }

  private recordsDir(): string {
    return join(this.baseDir, "records");
  }
}

function summary(record: ScopeConfirmationRecord): Record<string, unknown> {
  return {
    confirmationId: record.confirmationId,
    negotiationId: record.negotiationId,
    status: record.status,
    targetModule: record.confirmedScope.targetModule,
    allowedModules: record.confirmedScope.allowedModules,
    humanOverride: record.humanOverride,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  };
}
