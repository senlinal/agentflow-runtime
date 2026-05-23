import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isSupportedOutputSchema } from "./OutputSchemaRegistry.ts";
import type { RoleDefinition } from "./types.ts";

const ROLE_TYPES = ["mock", "llm", "code", "test", "verify", "repair", "approval", "materialize", "executionApproval", "executionDryRun"];

export class RoleCatalog {
  private rolesCache: RoleDefinition[] | null = null;
  private readonly rolesDir: string;

  constructor(rolesDir = "roles") {
    this.rolesDir = rolesDir;
  }

  async listRoles(): Promise<RoleDefinition[]> {
    if (this.rolesCache) return this.rolesCache;
    const entries = await readdir(this.rolesDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => join(this.rolesDir, entry.name));
    this.rolesCache = [];
    for (const path of files) {
      const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
      this.rolesCache.push(this.validateRole(raw, path));
    }
    return this.rolesCache.sort((left, right) => left.id.localeCompare(right.id));
  }

  async getRoleById(id: string): Promise<RoleDefinition> {
    const role = (await this.listRoles()).find((candidate) => candidate.id === id);
    if (!role) throw new Error(`Role preset not found: ${id}`);
    return role;
  }

  async getRoleByRoleName(roleName: string): Promise<RoleDefinition> {
    const role = (await this.listRoles()).find((candidate) => candidate.role === roleName);
    if (!role) throw new Error(`Role definition not found for role: ${roleName}`);
    return role;
  }

  validateRole(raw: unknown, source = "role"): RoleDefinition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`${source} must be a role definition object.`);
    }
    const record = raw as Record<string, unknown>;
    for (const key of [
      "id",
      "role",
      "description",
      "defaultType",
      "defaultInputKeys",
      "defaultOutputKey",
      "outputSchema",
      "defaultSystemPrompt",
    ]) {
      if (!(key in record)) throw new Error(`${source}.${key} is required.`);
    }
    if (!ROLE_TYPES.includes(String(record.defaultType))) {
      throw new Error(`${source}.defaultType is unsupported: ${String(record.defaultType)}`);
    }
    if (!Array.isArray(record.defaultInputKeys)) throw new Error(`${source}.defaultInputKeys must be an array.`);
    if (!isSupportedOutputSchema(record.outputSchema)) {
      throw new Error(`${source}.outputSchema is unsupported: ${String(record.outputSchema)}`);
    }
    return {
      id: requireString(record, "id", source),
      role: requireString(record, "role", source) as RoleDefinition["role"],
      description: requireString(record, "description", source),
      defaultType: record.defaultType as RoleDefinition["defaultType"],
      defaultInputKeys: record.defaultInputKeys as string[],
      defaultOutputKey: requireString(record, "defaultOutputKey", source) as RoleDefinition["defaultOutputKey"],
      outputSchema: record.outputSchema as OutputSchemaName,
      defaultSystemPrompt: requireString(record, "defaultSystemPrompt", source),
      defaultPolicies: record.defaultPolicies as RoleDefinition["defaultPolicies"],
    };
  }
}

function requireString(record: Record<string, unknown>, key: string, source: string): string {
  if (typeof record[key] !== "string" || !record[key]) throw new Error(`${source}.${key} must be a string.`);
  return record[key] as string;
}
