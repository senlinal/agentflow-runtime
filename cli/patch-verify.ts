import { parseArgs } from "./args.ts";
import { PatchExportStore } from "../core/patch/PatchExportStore.ts";
import { formatPatchVerificationResult, PatchVerifier } from "../core/patch/PatchVerifier.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.id) throw new Error("patch:verify requires --id <patchExportId>.");

const format = args.format === "json" ? "json" : "text";
const forbiddenFiles = args.forbiddenFiles
  ? args.forbiddenFiles.split(",").map((item) => item.trim()).filter(Boolean)
  : undefined;

try {
  const record = await new PatchExportStore(args.baseDir).get(args.id);
  const result = await new PatchVerifier().verify(record, { forbiddenFiles });
  process.stdout.write(formatPatchVerificationResult(result, format));
  if (result.status === "failed") process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
