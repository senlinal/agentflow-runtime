import { WorkflowProfileLoader, formatProfile } from "../core/profile/WorkflowProfileLoader.ts";
import { parseArgs } from "./args.ts";

const args = parseArgs(process.argv.slice(2));
const resolved = await new WorkflowProfileLoader().loadCurrentProfile();

if (args.format === "json") {
  console.log(JSON.stringify(resolved, null, 2));
} else {
  console.log(`activeProfile: ${resolved.current.activeProfile}`);
  console.log(formatProfile({ ...resolved.profile, sourcePath: resolved.sourcePath }, resolved.validation.warnings));
}
