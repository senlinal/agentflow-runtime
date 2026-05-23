import { OpenCodeWorkflowToolService } from "../../adapters/opencode/OpenCodeWorkflowToolService.ts";
import { fileURLToPath } from "node:url";

export async function listWorkflows(input: { includeDetails?: boolean } = {}) {
  return new OpenCodeWorkflowToolService().listWorkflows(input);
}

export default listWorkflows;

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const input = await readJsonInput<{ includeDetails?: boolean }>();
  console.log(JSON.stringify(await listWorkflows(input), null, 2));
}

async function readJsonInput<T>(): Promise<T> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) chunks.push(String(chunk));
  return JSON.parse(chunks.join("") || "{}") as T;
}
