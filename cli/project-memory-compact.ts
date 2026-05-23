import { ProjectMemoryStore } from "../core/profile/ProjectMemoryStore.ts";
import { formatCompactMemorySummary } from "../core/profile/ProjectMemoryFormatter.ts";
import { parseArgs } from "./args.ts";

const args = parseArgs(process.argv.slice(2));
const profileId = args.profile ?? "rag-optimization";
const store = new ProjectMemoryStore(args.baseDir);
const { summary, summaryPath } = await store.compact(profileId, args.limit ? Number(args.limit) : 100);

if (args.format === "json") {
  console.log(JSON.stringify({ summaryPath, summary }, null, 2));
} else {
  console.log(formatCompactMemorySummary(summary));
  console.log(`summaryPath: ${summaryPath}`);
}
