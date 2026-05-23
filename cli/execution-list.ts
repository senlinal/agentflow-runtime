import { parseArgs } from "./args.ts";
import { ExecutionRecordStore } from "../core/execution/ExecutionRecordStore.ts";
import { formatExecutionList } from "../core/execution/ExecutionRecordFormatter.ts";

const args = parseArgs(process.argv.slice(2));
const verification = args.verification === "passed" ? true : args.verification === "failed" ? false : undefined;
const limit = args.limit ? Number(args.limit) : 20;
const records = await new ExecutionRecordStore().list({
  status: args.status as "executed" | "failed" | "blocked" | undefined,
  codeChangePlanId: args.plan,
  approvalId: args.approval,
  verificationPass: verification,
  limit,
});

process.stdout.write(formatExecutionList(records, "text"));
