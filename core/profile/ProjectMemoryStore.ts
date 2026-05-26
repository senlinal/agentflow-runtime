import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { agentFlowPath } from "../AgentFlowPaths.ts";
import type { CompactMemorySummary, ProjectMemoryRecord, ProjectMemorySummary } from "../types.ts";
import { MemoryCompactor } from "./MemoryCompactor.ts";

export type ProjectMemoryListFilters = {
  profileId?: string;
  type?: ProjectMemoryRecord["type"];
  status?: ProjectMemoryRecord["status"];
  tag?: string;
  limit?: number;
};

export class ProjectMemoryStore {
  private readonly baseDir: string;

  constructor(baseDir = agentFlowPath(".agentflow/project-memory")) {
    this.baseDir = baseDir;
  }

  async save(record: ProjectMemoryRecord): Promise<{ recordPath: string }> {
    validateMemory(record);
    await mkdir(this.recordsDir(), { recursive: true });
    const recordPath = join(this.recordsDir(), `${record.memoryId}.json`);
    const payload = sanitizeRecord(record);
    await writeFile(recordPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await appendFile(join(this.baseDir, "records.jsonl"), `${JSON.stringify(summaryLine(payload))}\n`, "utf8");
    return { recordPath };
  }

  async get(memoryId: string): Promise<ProjectMemoryRecord> {
    try {
      return JSON.parse(await readFile(join(this.recordsDir(), `${memoryId}.json`), "utf8")) as ProjectMemoryRecord;
    } catch {
      throw new Error(`Project memory record not found: ${memoryId}`);
    }
  }

  async list(filters: ProjectMemoryListFilters = {}): Promise<ProjectMemoryRecord[]> {
    await mkdir(this.recordsDir(), { recursive: true });
    const files = (await readdir(this.recordsDir())).filter((file) => file.endsWith(".json"));
    const maybeRecords = await Promise.all(files.map((file) => this.tryGet(file.replace(/\.json$/, ""))));
    const records = maybeRecords.filter((record): record is ProjectMemoryRecord => record !== null);
    return records
      .filter((record) => !filters.profileId || record.profileId === filters.profileId)
      .filter((record) => !filters.type || record.type === filters.type)
      .filter((record) => !filters.status || record.status === filters.status)
      .filter((record) => !filters.tag || record.tags.includes(filters.tag))
      .sort((left, right) => (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt))
      .slice(0, filters.limit ?? 20);
  }

  async summarize(profileId: string, limit = 20): Promise<ProjectMemorySummary> {
    const records = await this.list({ profileId, limit });
    return {
      profileId,
      generatedAt: new Date().toISOString(),
      records,
      activeConfirmedScopes: records.filter((record) => record.type === "confirmed_scope" && record.status === "active"),
      triedRoutes: records.filter((record) => record.type === "tried_route"),
      rejectedRoutes: records.filter((record) => record.type === "rejected_route"),
      nextActions: records.filter((record) => record.type === "next_action" && record.status === "active"),
      warnings: [],
    };
  }

  async compact(profileId: string, limit = 100): Promise<{ summary: CompactMemorySummary; summaryPath: string }> {
    const records = await this.list({ profileId, limit });
    const summary = new MemoryCompactor().compact(profileId, records);
    await mkdir(this.compactedDir(), { recursive: true });
    const summaryPath = join(this.compactedDir(), `${profileId}.json`);
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    return { summary, summaryPath };
  }

  async getCompacted(profileId: string): Promise<CompactMemorySummary | null> {
    try {
      return JSON.parse(await readFile(join(this.compactedDir(), `${profileId}.json`), "utf8")) as CompactMemorySummary;
    } catch {
      return null;
    }
  }

  private recordsDir(): string {
    return join(this.baseDir, "records");
  }

  private compactedDir(): string {
    return join(this.baseDir, "compacted");
  }

  private async tryGet(memoryId: string): Promise<ProjectMemoryRecord | null> {
    try {
      return await this.get(memoryId);
    } catch {
      return null;
    }
  }
}

function validateMemory(record: ProjectMemoryRecord): void {
  if (!record.memoryId) throw new Error("ProjectMemoryRecord.memoryId is required.");
  if (!record.profileId) throw new Error("ProjectMemoryRecord.profileId is required.");
  if (!record.title) throw new Error("ProjectMemoryRecord.title is required.");
  if (!record.summary) throw new Error("ProjectMemoryRecord.summary is required.");
  if (containsSecretLikeValue(record)) throw new Error("ProjectMemoryRecord must not contain secret-like values.");
}

function sanitizeRecord(record: ProjectMemoryRecord): ProjectMemoryRecord {
  return {
    ...record,
    title: redact(record.title),
    summary: redact(record.summary),
    tags: record.tags.map(redact),
  };
}

function summaryLine(record: ProjectMemoryRecord): Record<string, unknown> {
  return {
    memoryId: record.memoryId,
    profileId: record.profileId,
    type: record.type,
    title: record.title,
    tags: record.tags,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function containsSecretLikeValue(value: unknown): boolean {
  const record = value as Partial<ProjectMemoryRecord>;
  const text = [record.title, record.summary, ...(record.tags ?? [])].filter(Boolean).join("\n");
  return /(api[_-]?key|authorization|bearer\s+[a-z0-9._-]+|\bsk-[a-z0-9_-]{16,}\b|token\s*[:=]\s*[a-z0-9._-]{8,}|secret\s*[:=]\s*[a-z0-9._-]{8,})/i.test(text);
}

function redact(value: string): string {
  return value.replace(/(api[_-]?key|authorization|token|secret|credential)\s*[:=]\s*\S+/gi, "$1=[REDACTED]");
}
