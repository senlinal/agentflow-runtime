import { parseArgs } from "./args.ts";
import { ApprovalReplayService } from "../adapters/opencode/ApprovalReplayService.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.id) throw new Error("Missing --id");

console.log(JSON.stringify(new ApprovalReplayService().buildReplayPlan(args.id), null, 2));
