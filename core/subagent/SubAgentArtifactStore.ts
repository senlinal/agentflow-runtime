import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SubAgentDispatchMetadata } from "../types.ts";

export type SubAgentArtifactRecord = SubAgentDispatchMetadata & {
  outputArtifactPath: string;
};

export class SubAgentArtifactStore {
  private readonly runDir: string;

  constructor(runDir: string) {
    this.runDir = runDir;
  }

  async start(input: {
    metadata: SubAgentDispatchMetadata;
    input: unknown;
    prompt?: string;
  }): Promise<SubAgentDispatchMetadata> {
    const dir = this.subAgentDir(input.metadata.subAgentId);
    await mkdir(dir, { recursive: true });
    await writeFile(input.metadata.inputArtifactPath, `${JSON.stringify(input.input, null, 2)}\n`, "utf8");
    if (input.prompt && input.metadata.promptPath) {
      await writeFile(input.metadata.promptPath, `${input.prompt.trimEnd()}\n`, "utf8");
    }
    await writeFile(input.metadata.metadataPath, `${JSON.stringify(input.metadata, null, 2)}\n`, "utf8");
    return input.metadata;
  }

  async complete(input: {
    metadata: SubAgentDispatchMetadata;
    output: unknown;
    summary: string;
  }): Promise<SubAgentArtifactRecord> {
    const outputArtifactPath = input.metadata.outputArtifactPath ?? join(this.subAgentDir(input.metadata.subAgentId), "output.json");
    const summaryPath = input.metadata.summaryPath ?? join(this.subAgentDir(input.metadata.subAgentId), "summary.md");
    const completed = {
      ...input.metadata,
      outputArtifactPath,
      summaryPath,
      completedAt: input.metadata.completedAt ?? new Date().toISOString(),
    };
    await writeFile(outputArtifactPath, `${JSON.stringify(input.output, null, 2)}\n`, "utf8");
    await writeFile(summaryPath, `${input.summary.trimEnd()}\n`, "utf8");
    await writeFile(completed.metadataPath, `${JSON.stringify(completed, null, 2)}\n`, "utf8");
    return completed as SubAgentArtifactRecord;
  }

  subAgentDir(subAgentId: string): string {
    return join(this.runDir, "subagents", subAgentId);
  }
}
