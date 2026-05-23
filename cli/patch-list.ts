import { parseArgs } from "./args.ts";
import { PatchExportStore } from "../core/patch/PatchExportStore.ts";
import { formatPatchExportList, type PatchExportFormat } from "../core/patch/PatchExportFormatter.ts";

const args = parseArgs(process.argv.slice(2));
const format = args.format === "json" ? "json" : "text";
const safe = args.safe === "true" ? true : args.safe === "false" ? false : undefined;
const records = await new PatchExportStore(args.baseDir).list({
  executionId: args.execution,
  safeToApplyManually: safe,
  limit: args.limit ? Number(args.limit) : 20,
});

process.stdout.write(formatPatchExportList(records, format as PatchExportFormat));
