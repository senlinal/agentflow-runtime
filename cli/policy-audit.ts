import { parseArgs } from "./args.ts";
import { PolicyAuditLogger } from "../adapters/opencode/PolicyAuditLogger.ts";

const args = parseArgs(process.argv.slice(2));
const limit = args.limit ? Number(args.limit) : 20;
const action = args.action as "allow" | "ask" | "deny" | undefined;
const records = new PolicyAuditLogger().recent({ limit: 10_000, action })
  .filter((record) => !args.id || record.decisionId === args.id || record.replayOfDecisionId === args.id)
  .filter((record) => !args.hash || record.toolCallHash === args.hash)
  .slice(0, limit);

if (records.length === 0) {
  console.log("No policy decisions found.");
} else {
  for (const record of records) {
    console.log(
      `${record.timestamp}\t${record.action}\t${record.riskLevel}\t${record.decisionId}\treplayOf=${record.replayOfDecisionId ?? "n/a"}\thash=${record.toolCallHash ?? "n/a"}\t${record.toolName}\t${record.matchedRule}\t${record.reason}`,
    );
  }
}
