import { WorkflowProfileLoader, formatProfile } from "../core/profile/WorkflowProfileLoader.ts";
import { parseArgs } from "./args.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.profile) throw new Error("Missing --profile");

const loader = new WorkflowProfileLoader();
const { profile, sourcePath } = await loader.loadProfile(args.profile);
const validation = await loader.validateProfile(profile);

if (args.format === "json") {
  console.log(JSON.stringify({
    profile,
    sourcePath,
    validation,
    workflowChain: loader.resolveProfileWorkflowChain(profile),
  }, null, 2));
} else {
  console.log(formatProfile({ ...profile, sourcePath }, validation.warnings));
  if (!validation.valid) {
    console.log(`errors: ${validation.errors.join("; ")}`);
    process.exitCode = 1;
  }
}
