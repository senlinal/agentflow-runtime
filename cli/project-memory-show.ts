import { ProjectMemoryStore } from "../core/profile/ProjectMemoryStore.ts";
import { formatProjectMemory } from "../core/profile/ProjectMemoryFormatter.ts";
import { parseArgs } from "./args.ts";

const args = parseArgs(process.argv.slice(2));

if (!args.id) {
  console.error("Missing required --id <memoryId>.");
  process.exitCode = 1;
} else {
  try {
    const record = await new ProjectMemoryStore(args.baseDir).get(args.id);
    console.log(formatProjectMemory(record, args.format === "json" ? "json" : "text"));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
