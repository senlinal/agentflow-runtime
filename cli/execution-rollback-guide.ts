import { parseArgs } from "./args.ts";
import { ExecutionRecordStore } from "../core/execution/ExecutionRecordStore.ts";
import { formatRollbackGuide, type ExecutionFormat } from "../core/execution/ExecutionRecordFormatter.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.id) throw new Error("execution:rollback-guide requires --id <executionId>.");
const format = args.format === "json" ? "json" : "text";
try {
  const guide = await new ExecutionRecordStore(args.baseDir).getRollbackGuide(args.id);
  process.stdout.write(formatRollbackGuide(guide, format as ExecutionFormat));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
