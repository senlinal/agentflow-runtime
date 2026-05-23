import { OpenCodeWorkflowToolService, type CreateWorkflowToolInput } from "../../adapters/opencode/OpenCodeWorkflowToolService.ts";
import { fileURLToPath } from "node:url";

export async function createWorkflow(input: CreateWorkflowToolInput) {
  return new OpenCodeWorkflowToolService().createWorkflow(input);
}

export default createWorkflow;

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const input = await readJsonInput<CreateWorkflowToolInput>();
  console.log(JSON.stringify(await createWorkflow(input), null, 2));
}

async function readJsonInput<T>(): Promise<T> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) chunks.push(String(chunk));
  return JSON.parse(chunks.join("") || "{}") as T;
}
