import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRootFromModule = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function agentFlowRoot(): string {
  return resolve(process.env.AGENTFLOW_PROJECT_ROOT || repoRootFromModule);
}

export function agentFlowPath(path: string): string {
  return isAbsolute(path) ? path : join(agentFlowRoot(), path);
}

export function workspaceRoot(): string {
  return resolve(process.env.AGENTFLOW_WORKSPACE_ROOT || process.cwd());
}
