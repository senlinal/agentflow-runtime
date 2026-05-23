import { OpenCodeWorkflowToolService, type RunWorkflowToolInput } from "../../adapters/opencode/OpenCodeWorkflowToolService.ts";
import { fileURLToPath } from "node:url";

export async function runWorkflow(input: RunWorkflowToolInput) {
  return new OpenCodeWorkflowToolService().runWorkflow(input);
}

export default runWorkflow;

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const input = await readJsonInput<RunWorkflowToolInput>();
  console.log(JSON.stringify(await runWorkflow(input), null, 2));
}

async function readJsonInput<T>(): Promise<T> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) chunks.push(String(chunk));
  return JSON.parse(chunks.join("") || "{}") as T;
}
