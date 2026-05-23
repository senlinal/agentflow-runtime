import { ScopeConfirmationStore } from "../core/scope/ScopeConfirmationStore.ts";
import { formatScopeConfirmation } from "../core/scope/ScopeConfirmationFormatter.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.id) {
  console.error("Missing required --id <confirmationId>.");
  process.exitCode = 1;
} else {
  try {
    const record = await new ScopeConfirmationStore(args.baseDir).get(args.id);
    console.log(formatScopeConfirmation(record, args.format === "json" ? "json" : "text"));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

function parseArgs(argv: string[]): Record<string, string | undefined> {
  const parsed: Record<string, string | undefined> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item.startsWith("--")) parsed[item.slice(2)] = argv[index + 1]?.startsWith("--") ? "true" : argv[++index];
  }
  return parsed;
}
