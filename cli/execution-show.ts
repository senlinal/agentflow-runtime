import { parseArgs } from "./args.ts";
import { ExecutionRecordStore } from "../core/execution/ExecutionRecordStore.ts";
import { formatExecutionRecord, type ExecutionFormat } from "../core/execution/ExecutionRecordFormatter.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.id) throw new Error("execution:show requires --id <executionId>.");
const format = args.format === "json" ? "json" : "text";
try {
  const record = await new ExecutionRecordStore().get(args.id);
  process.stdout.write(formatExecutionRecord(record, format as ExecutionFormat));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
