import type { OutputSchemaName } from "./types.ts";
import { getOutputSchemaInstruction } from "./OutputSchemaRegistry.ts";
import { truncateAndRedact } from "./SecretRedactor.ts";

export type RepairPromptInput = {
  outputSchemaName: OutputSchemaName;
  error: string;
  rawOutput: string;
  maxRawOutputChars?: number;
};

export class StructuredOutputRepairer {
  static buildRepairPrompt(input: RepairPromptInput): string {
    const rawPreview = truncateAndRedact(input.rawOutput, input.maxRawOutputChars ?? 2_000);
    const errorPreview = truncateAndRedact(input.error, 1_000);
    return [
      "Repair the previous model output.",
      "Return only the corrected JSON object.",
      "Do not return Markdown.",
      "Do not add explanations before or after the JSON.",
      "",
      getOutputSchemaInstruction(input.outputSchemaName),
      "",
      `Validation or parsing error: ${errorPreview}`,
      "",
      "Previous raw output preview:",
      rawPreview,
    ].join("\n");
  }
}
