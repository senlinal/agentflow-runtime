import { parseArgs } from "./args.ts";
import { formatPolicyTimelineText, PolicyTimelineService } from "../adapters/opencode/PolicyTimelineService.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.id) throw new Error("Missing --id");

const timeline = new PolicyTimelineService(args.policyDir ?? ".opencode/policy-runs").buildTimeline(args.id);
if (args.format === "json") {
  console.log(JSON.stringify(timeline, null, 2));
} else {
  console.log(formatPolicyTimelineText(timeline));
}
