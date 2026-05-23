import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { SchemaValidator } from "./SchemaValidator.ts";
import type { TaskBrief } from "./types.ts";

export class TaskBriefLoader {
  static async loadJson(path: string): Promise<TaskBrief> {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return this.fromObject(parsed, path);
  }

  static fromObject(raw: unknown, source = "inline"): TaskBrief {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`TaskBrief ${source} must be a JSON object.`);
    }
    const record = { ...(raw as Record<string, unknown>) };
    if (!record.taskId) {
      record.taskId = generateTaskId(source, record.goal);
    }
    return SchemaValidator.validate("TaskBrief", record) as TaskBrief;
  }
}

function generateTaskId(source: string, goal: unknown): string {
  const seed = `${basename(source)}:${typeof goal === "string" ? goal : "missing-goal"}`;
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `task_${hash.toString(16)}`;
}
