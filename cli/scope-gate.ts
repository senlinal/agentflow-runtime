import { ScopeConfirmationService } from "../core/scope/ScopeConfirmationService.ts";
import { ScopeConfirmationStore } from "../core/scope/ScopeConfirmationStore.ts";
import { formatScopeGate } from "../core/scope/ScopeConfirmationFormatter.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.id) {
  console.error("Missing required --id <confirmationId>.");
  process.exitCode = 1;
} else {
  try {
    const record = await new ScopeConfirmationStore(args.baseDir).get(args.id);
    const result = new ScopeConfirmationService().evaluateGate(record);
    console.log(formatScopeGate(result, args.format === "json" ? "json" : "text"));
    if (!result.allowed) process.exitCode = 1;
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
