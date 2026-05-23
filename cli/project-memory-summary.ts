import { ProjectMemoryStore } from "../core/profile/ProjectMemoryStore.ts";
import { formatProjectMemorySummary } from "../core/profile/ProjectMemoryFormatter.ts";
import { parseArgs } from "./args.ts";

const args = parseArgs(process.argv.slice(2));
const profileId = args.profile ?? "rag-optimization";
const summary = await new ProjectMemoryStore(args.baseDir).summarize(profileId, args.limit ? Number(args.limit) : 20);

console.log(formatProjectMemorySummary(summary, args.format === "json" ? "json" : "text"));
