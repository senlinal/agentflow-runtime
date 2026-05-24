import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { agentFlowPath } from "./AgentFlowPaths.ts";

/**
 * Minimal .env loader. Loads KEY=VALUE lines from .env (if it exists)
 * into process.env without overwriting existing values.
 */
export function loadDotenv(path = agentFlowPath(".env")): void {
  const envPath = resolve(path);
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}
