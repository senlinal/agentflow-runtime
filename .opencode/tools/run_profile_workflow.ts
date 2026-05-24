import { OpenCodeWorkflowToolService } from "../../adapters/opencode/OpenCodeWorkflowToolService.ts";
import type { ProfileWorkflowRunRequest } from "../../core/profile/ProfileWorkflowRunner.ts";
import { fileURLToPath } from "node:url";

// Compatibility wrapper for direct JSON-stdin checks.
// The live OpenCode entrypoint is the MCP server configured in opencode.json.
export async function runProfileWorkflow(input: ProfileWorkflowRunRequest) {
  return new OpenCodeWorkflowToolService().runProfileWorkflow(input);
}

export default runProfileWorkflow;

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const input = await readJsonInput<ProfileWorkflowRunRequest>();
  console.log(JSON.stringify(await runProfileWorkflow(input), null, 2));
}

async function readJsonInput<T>(): Promise<T> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) chunks.push(String(chunk));
  return JSON.parse(chunks.join("") || "{}") as T;
}
