import { OpenCodeWorkflowToolService } from "../../adapters/opencode/OpenCodeWorkflowToolService.ts";
import { fileURLToPath } from "node:url";

export async function inspectWorkflow(input: { template: string }) {
  return new OpenCodeWorkflowToolService().inspectWorkflow(input);
}

export default inspectWorkflow;

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const input = await readJsonInput<{ template: string }>();
  console.log(JSON.stringify(await inspectWorkflow(input), null, 2));
}

async function readJsonInput<T>(): Promise<T> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) chunks.push(String(chunk));
  return JSON.parse(chunks.join("") || "{}") as T;
}
