import { ScopeConfirmationStore } from "../core/scope/ScopeConfirmationStore.ts";
import { formatScopeConfirmations } from "../core/scope/ScopeConfirmationFormatter.ts";
import type { ScopeConfirmationRecord } from "../core/types.ts";

const args = parseArgs(process.argv.slice(2));
const records = await new ScopeConfirmationStore(args.baseDir).list({
  status: args.status as ScopeConfirmationRecord["status"] | undefined,
  negotiationId: args.negotiation,
  limit: args.limit ? Number(args.limit) : undefined,
});
console.log(formatScopeConfirmations(records, args.format === "json" ? "json" : "text"));

function parseArgs(argv: string[]): Record<string, string | undefined> {
  const parsed: Record<string, string | undefined> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item.startsWith("--")) parsed[item.slice(2)] = argv[index + 1]?.startsWith("--") ? "true" : argv[++index];
  }
  return parsed;
}
