import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentRole, OutputSchemaName } from "./types.ts";
import { getOutputSchemaInstruction } from "./OutputSchemaRegistry.ts";

export type PromptRenderInput = {
  role: AgentRole;
  systemPrompt?: string;
  input: Record<string, unknown>;
  outputSchemaName: OutputSchemaName;
  promptsDir?: string;
};

export type RenderedPrompt = {
  systemPrompt: string;
  userPrompt: string;
  promptPath?: string;
};

export class PromptRenderer {
  private readonly promptsDir: string;

  constructor(promptsDir = "prompts/roles") {
    this.promptsDir = promptsDir;
  }

  render(input: PromptRenderInput): RenderedPrompt {
    const loaded = this.loadRolePrompt(input.role);
    const systemPrompt = [
      loaded.content ?? safeDefaultPrompt(input.role),
      input.systemPrompt ? `\nNode-specific instruction:\n${input.systemPrompt}` : "",
    ].filter(Boolean).join("\n");
    const userPrompt = [
      "Use the following structured input to produce the node output.",
      "",
      getOutputSchemaInstruction(input.outputSchemaName),
      "",
      "Respect TaskBrief.constraints and TaskBrief.nonGoals when present.",
      "If information is insufficient, say so in the configured schema fields instead of inventing facts.",
      "",
      `Input JSON: ${JSON.stringify(input.input)}`,
    ].join("\n");

    return {
      systemPrompt,
      userPrompt,
      promptPath: loaded.path,
    };
  }

  private loadRolePrompt(role: AgentRole): { content?: string; path?: string } {
    const path = join(this.promptsDir, `${roleToPromptName(role)}.md`);
    if (!existsSync(path)) return {};
    return { content: readFileSync(path, "utf8"), path };
  }
}

function safeDefaultPrompt(role: AgentRole): string {
  return [
    `You are the ${role} node in a configuration-driven workflow runtime.`,
    "Return only one JSON object.",
    "Do not return Markdown.",
    "Do not add explanatory prose.",
    "The object must satisfy the requested output schema.",
    "Respect TaskBrief.constraints and TaskBrief.nonGoals.",
    "Do not invent missing facts.",
  ].join("\n");
}

export function roleToPromptName(role: AgentRole): string {
  return role.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}
