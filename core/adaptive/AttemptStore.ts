import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { truncateAndRedact } from "../SecretRedactor.ts";
import type { AttemptDecision, ExecutionAttempt, WorkflowContext } from "../types.ts";

export class AttemptStore {
  private readonly attemptsDir: string;

  constructor(attemptsDir: string) {
    this.attemptsDir = attemptsDir;
  }

  static fromContext(context: WorkflowContext): AttemptStore | null {
    const dir = context.runtimeMetadata?.adaptiveExecution?.attemptsDir;
    return dir ? new AttemptStore(dir) : null;
  }

  async saveAttempt(attempt: ExecutionAttempt): Promise<string> {
    await mkdir(this.attemptsDir, { recursive: true });
    const path = join(this.attemptsDir, `${attempt.attemptId}.json`);
    await writeFile(path, safeJson(attempt), "utf8");
    return path;
  }

  async appendDecision(decision: AttemptDecision): Promise<string> {
    await mkdir(this.attemptsDir, { recursive: true });
    const path = join(this.attemptsDir, "decisions.jsonl");
    await appendFile(path, `${truncateAndRedact(JSON.stringify(decision), 20000)}\n`, "utf8");
    return path;
  }

  async saveAttemptWithDecision(attempt: ExecutionAttempt, decision: AttemptDecision): Promise<{ attemptPath: string; decisionsPath: string }> {
    const attemptPath = await this.saveAttempt(attempt);
    const decisionsPath = await this.appendDecision(decision);
    return { attemptPath, decisionsPath };
  }
}

function safeJson(value: unknown): string {
  return `${truncateAndRedact(JSON.stringify(value, null, 2), 20000)}\n`;
}
