import { parseArgs } from "./args.ts";
import { PatchExportStore } from "../core/patch/PatchExportStore.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.id) throw new Error("patch:apply-guide requires --id <patchExportId>.");

try {
  const store = new PatchExportStore(args.baseDir);
  const guide = await store.readApplyGuide(args.id);
  if (args.format === "json") {
    const record = await store.get(args.id);
    process.stdout.write(`${JSON.stringify({ patchExportId: args.id, applyGuide: guide, applyGuidePath: record.applyGuidePath }, null, 2)}\n`);
  } else {
    process.stdout.write(guide);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
