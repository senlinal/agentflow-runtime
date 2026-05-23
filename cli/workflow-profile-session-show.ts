import { ProfileSessionStore } from "../core/profile/ProfileSessionStore.ts";
import { parseArgs } from "./args.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.id) throw new Error("Missing --id");

const session = await new ProfileSessionStore(args.baseDir).get(args.id);
if (args.format === "json") {
  console.log(JSON.stringify(session, null, 2));
} else {
  console.log(`sessionId: ${session.sessionId}`);
  console.log(`profileId: ${session.profileId}`);
  console.log(`status: ${session.status}`);
  console.log(`task: ${session.task}`);
  console.log(`negotiationId: ${session.negotiationId ?? "n/a"}`);
  console.log(`scopeConfirmationId: ${session.scopeConfirmationId ?? "n/a"}`);
  console.log(`lastRunId: ${session.lastRunId ?? "n/a"}`);
  console.log(`pendingQuestions: ${session.pendingQuestions.join(" | ") || "none"}`);
  console.log(`createdAt: ${session.createdAt}`);
  console.log(`updatedAt: ${session.updatedAt}`);
}
