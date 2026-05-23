import { parseArgs } from "./args.ts";
import { PatchExportStore } from "../core/patch/PatchExportStore.ts";
import { formatPatchExportRecord, type PatchExportFormat } from "../core/patch/PatchExportFormatter.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.id) throw new Error("patch:show requires --id <patchExportId>.");
const format = args.format === "json" ? "json" : "text";

try {
  const record = await new PatchExportStore(args.baseDir).get(args.id);
  process.stdout.write(formatPatchExportRecord(record, format as PatchExportFormat));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
