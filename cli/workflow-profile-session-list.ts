import { ProfileSessionStore } from "../core/profile/ProfileSessionStore.ts";
import { parseArgs } from "./args.ts";

const args = parseArgs(process.argv.slice(2));
const sessions = await new ProfileSessionStore(args.baseDir).list({
  profileId: args.profile,
  status: args.status as never,
  limit: args.limit ? Number(args.limit) : undefined,
});

if (args.format === "json") {
  console.log(JSON.stringify(sessions, null, 2));
} else if (sessions.length === 0) {
  console.log("No profile sessions found.");
} else {
  for (const session of sessions) {
    console.log(`${session.sessionId}\t${session.profileId}\t${session.status}\t${session.negotiationId ?? "n/a"}\t${session.scopeConfirmationId ?? "n/a"}\t${session.updatedAt}`);
  }
}
