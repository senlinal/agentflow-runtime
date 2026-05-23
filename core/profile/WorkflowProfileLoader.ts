import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, isAbsolute } from "node:path";
import { WorkflowTemplateRegistry } from "../WorkflowTemplateRegistry.ts";

export type CurrentWorkflowProfile = {
  activeProfile: string;
};

export type WorkflowProfile = {
  id: string;
  name: string;
  description: string;
  defaultWorkflow: string;
  scopeWorkflow?: string;
  followupWorkflows?: string[];
  defaultInput?: string;
  scopeInput?: string;
  policyFiles?: string[];
  memoryFiles?: string[];
  defaultConstraints?: string[];
  defaultBlockedActions?: string[];
  autonomyMode?: "balanced" | "guarded" | "manual" | string;
  defaultOutput?: string[];
  externalProjectMode?: string;
  patchFlow?: string[];
};

export type WorkflowProfileValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type ResolvedWorkflowProfile = {
  current: CurrentWorkflowProfile;
  profile: WorkflowProfile;
  validation: WorkflowProfileValidationResult;
  workflowChain: string[];
  sourcePath: string;
};

export class WorkflowProfileLoader {
  private readonly profilesDir: string;
  private readonly workflowRegistry: WorkflowTemplateRegistry;

  constructor(profilesDir = "profiles", workflowRegistry = new WorkflowTemplateRegistry()) {
    this.profilesDir = profilesDir;
    this.workflowRegistry = workflowRegistry;
  }

  async listProfiles(): Promise<Array<WorkflowProfile & { sourcePath: string; warnings: string[] }>> {
    const files = await this.profileFiles();
    const profiles = await Promise.all(files.map(async (sourcePath) => {
      const profile = await this.readProfile(sourcePath);
      const validation = await this.validateProfile(profile);
      return { ...profile, sourcePath, warnings: validation.warnings };
    }));
    return profiles.sort((left, right) => left.id.localeCompare(right.id));
  }

  async loadCurrentProfile(): Promise<ResolvedWorkflowProfile> {
    const currentPath = join(this.profilesDir, "current.json");
    const current = JSON.parse(await readFile(currentPath, "utf8")) as CurrentWorkflowProfile;
    if (!current.activeProfile) throw new Error("profiles/current.json is missing activeProfile");
    const { profile, sourcePath } = await this.loadProfile(current.activeProfile);
    const validation = await this.validateProfile(profile);
    if (!validation.valid) {
      throw new Error(`Current workflow profile is invalid: ${validation.errors.join("; ")}`);
    }
    return {
      current,
      profile,
      validation,
      workflowChain: this.resolveProfileWorkflowChain(profile),
      sourcePath,
    };
  }

  async loadProfile(id: string): Promise<{ profile: WorkflowProfile; sourcePath: string }> {
    const sourcePath = join(this.profilesDir, `${id.endsWith(".json") ? id : `${id}.json`}`);
    await assertExists(sourcePath, `Workflow profile not found: ${id}`);
    const profile = await this.readProfile(sourcePath);
    if (profile.id !== id.replace(/\.json$/, "")) {
      throw new Error(`Workflow profile id mismatch in ${sourcePath}: expected ${id.replace(/\.json$/, "")}, got ${profile.id}`);
    }
    return { profile, sourcePath };
  }

  async useProfile(id: string): Promise<{ activeProfile: string; path: string }> {
    await this.loadProfile(id);
    const path = join(this.profilesDir, "current.json");
    await writeFile(path, `${JSON.stringify({ activeProfile: id }, null, 2)}\n`);
    return { activeProfile: id, path };
  }

  async validateProfile(profile: WorkflowProfile): Promise<WorkflowProfileValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!profile.id) errors.push("profile.id is required");
    if (!profile.name) errors.push("profile.name is required");
    if (!profile.defaultWorkflow) errors.push("profile.defaultWorkflow is required");

    const secretFinding = findSecretLikeEntry(profile);
    if (secretFinding) errors.push(secretFinding);

    const pathFields = [
      profile.defaultInput,
      profile.scopeInput,
      ...(profile.policyFiles ?? []),
      ...(profile.memoryFiles ?? []),
    ].filter(Boolean) as string[];
    for (const item of pathFields) {
      if (isAbsolute(item)) errors.push(`Profile path must be project-relative: ${item}`);
    }

    if (profile.defaultWorkflow) await this.validateWorkflow(profile.defaultWorkflow, errors, "defaultWorkflow");
    if (profile.scopeWorkflow) await this.validateWorkflow(profile.scopeWorkflow, errors, "scopeWorkflow");
    for (const workflow of profile.followupWorkflows ?? []) {
      await this.validateWorkflow(workflow, errors, "followupWorkflows");
    }

    if (profile.defaultInput) await this.validateExistingPath(profile.defaultInput, errors, "defaultInput");
    if (profile.scopeInput) await this.validateExistingPath(profile.scopeInput, errors, "scopeInput");
    for (const file of profile.policyFiles ?? []) {
      await this.validateExistingPath(file, errors, "policyFiles");
    }
    for (const file of profile.memoryFiles ?? []) {
      try {
        await access(file);
      } catch {
        warnings.push(`Memory file not found: ${file}`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  resolveProfileWorkflowChain(profile: WorkflowProfile): string[] {
    return [
      profile.defaultWorkflow,
      ...(profile.scopeWorkflow ? [profile.scopeWorkflow] : []),
      ...(profile.followupWorkflows ?? []),
    ].filter(Boolean);
  }

  private async profileFiles(): Promise<string[]> {
    const entries = await readdir(this.profilesDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "current.json")
      .map((entry) => join(this.profilesDir, entry.name));
  }

  private async readProfile(path: string): Promise<WorkflowProfile> {
    return JSON.parse(await readFile(path, "utf8")) as WorkflowProfile;
  }

  private async validateWorkflow(workflow: string, errors: string[], field: string): Promise<void> {
    try {
      await this.workflowRegistry.resolveTemplatePath(workflow);
    } catch (error) {
      errors.push(`${field} references missing workflow ${workflow}: ${(error as Error).message}`);
    }
  }

  private async validateExistingPath(path: string, errors: string[], field: string): Promise<void> {
    try {
      await access(path);
    } catch {
      errors.push(`${field} references missing file: ${path}`);
    }
  }
}

async function assertExists(path: string, message: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new Error(message);
  }
}

function findSecretLikeEntry(value: unknown, trail: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const finding = findSecretLikeEntry(value[index], [...trail, String(index)]);
      if (finding) return finding;
    }
    return null;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && looksLikeSecretValue(value)) {
      return `Profile contains secret-like value at ${trail.join(".") || "<root>"}`;
    }
    return null;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (/(api[_-]?key|token|secret|password|credential)/i.test(key)) {
      return `Profile contains secret-like field: ${[...trail, key].join(".")}`;
    }
    const finding = findSecretLikeEntry(nested, [...trail, key]);
    if (finding) return finding;
  }
  return null;
}

function looksLikeSecretValue(value: string): boolean {
  return /\bsk-[A-Za-z0-9_-]{20,}/.test(value) || /(?:api[_-]?key|token|secret|password)\s*[:=]/i.test(value);
}

export function formatProfile(profile: WorkflowProfile & { sourcePath?: string }, warnings: string[] = []): string {
  return [
    `id: ${profile.id}`,
    `name: ${profile.name}`,
    `description: ${profile.description}`,
    profile.sourcePath ? `sourcePath: ${profile.sourcePath}` : undefined,
    `defaultWorkflow: ${profile.defaultWorkflow}`,
    `scopeWorkflow: ${profile.scopeWorkflow ?? "none"}`,
    `followupWorkflows: ${(profile.followupWorkflows ?? []).join(", ") || "none"}`,
    `defaultInput: ${profile.defaultInput ?? "none"}`,
    `scopeInput: ${profile.scopeInput ?? "none"}`,
    `policyFiles: ${(profile.policyFiles ?? []).join(", ") || "none"}`,
    `memoryFiles: ${(profile.memoryFiles ?? []).join(", ") || "none"}`,
    `defaultConstraints: ${(profile.defaultConstraints ?? []).join(", ") || "none"}`,
    `defaultBlockedActions: ${(profile.defaultBlockedActions ?? []).join(", ") || "none"}`,
    `autonomyMode: ${profile.autonomyMode ?? "unspecified"}`,
    `workflowChain: ${[profile.defaultWorkflow, ...(profile.scopeWorkflow ? [profile.scopeWorkflow] : []), ...(profile.followupWorkflows ?? [])].join(" -> ")}`,
    `warnings: ${warnings.join("; ") || "none"}`,
  ].filter(Boolean).join("\n");
}

export function profileFileName(profile: WorkflowProfile): string {
  return `${basename(profile.id)}.json`;
}
