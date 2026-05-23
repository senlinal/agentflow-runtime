import { ProjectMemoryStore } from "../core/profile/ProjectMemoryStore.ts";
import { formatProjectMemories } from "../core/profile/ProjectMemoryFormatter.ts";
import type { ProjectMemoryRecord } from "../core/types.ts";
import { parseArgs } from "./args.ts";

const args = parseArgs(process.argv.slice(2));
const records = await new ProjectMemoryStore(args.baseDir).list({
  profileId: args.profile,
  type: args.type as ProjectMemoryRecord["type"] | undefined,
  status: args.status as ProjectMemoryRecord["status"] | undefined,
  tag: args.tag,
  limit: args.limit ? Number(args.limit) : undefined,
});

console.log(formatProjectMemories(records, args.format === "json" ? "json" : "text"));
