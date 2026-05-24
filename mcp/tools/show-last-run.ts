import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { agentFlowPath } from "../../core/AgentFlowPaths.ts";

export async function agentflowShowLastRun(rootDir = agentFlowPath(".workflow-runs")): Promise<{
  found: boolean;
  runId?: string;
  summaryPath?: string;
  tracePath?: string;
  contextPath?: string;
  summaryPreview?: string;
}> {
  let entries: string[];
  try {
    entries = await readdir(rootDir);
  } catch {
    return { found: false };
  }

  const runs = [];
  for (const entry of entries) {
    const path = join(rootDir, entry);
    try {
      const item = await stat(path);
      if (item.isDirectory()) runs.push({ entry, mtimeMs: item.mtimeMs });
    } catch {
      // Ignore races with cleanup.
    }
  }
  runs.sort((left, right) => right.mtimeMs - left.mtimeMs);
  const latest = runs[0];
  if (!latest) return { found: false };

  const base = join(rootDir, latest.entry);
  const summaryPath = join(base, "summary.md");
  let summaryPreview = "";
  try {
    summaryPreview = (await readFile(summaryPath, "utf8")).slice(0, 2000);
  } catch {
    summaryPreview = "";
  }

  return {
    found: true,
    runId: latest.entry,
    summaryPath,
    tracePath: join(base, "trace.json"),
    contextPath: join(base, "context.json"),
    summaryPreview,
  };
}
