import { parseArgs } from "./args.ts";
import { PolicyApprovalStore } from "../adapters/opencode/PolicyApprovalStore.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.id) throw new Error("Missing --id");

const result = new PolicyApprovalStore().reject(args.id, args.note ?? "");
console.log(JSON.stringify(result, null, 2));
