import { createHash } from "node:crypto";
import { resolve } from "node:path";

export type ToolCallHashInput = {
  toolName: string;
  toolArgs: unknown;
  command?: string | null;
  affectedPaths?: string[];
  projectRoot: string;
};

export type NormalizedToolCall = {
  toolName: string;
  normalizedArgs: unknown;
  command: string | null;
  affectedPaths: string[];
  projectRoot: string;
};

export class ToolCallHasher {
  static normalize(input: ToolCallHashInput): NormalizedToolCall {
    const projectRoot = resolve(input.projectRoot);
    return {
      toolName: input.toolName,
      normalizedArgs: normalizeValue(input.toolArgs),
      command: input.command ?? null,
      affectedPaths: [...new Set((input.affectedPaths ?? []).map((path) => resolve(projectRoot, path)))].sort(),
      projectRoot,
    };
  }

  static hash(input: ToolCallHashInput): { hash: string; normalized: NormalizedToolCall } {
    const normalized = this.normalize(input);
    const stable = stableStringify(normalized);
    return {
      hash: createHash("sha256").update(stable).digest("hex"),
      normalized,
    };
  }
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      output[key] = normalizeValue((value as Record<string, unknown>)[key]);
    }
    return output;
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}
