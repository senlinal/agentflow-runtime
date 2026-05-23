import { WorkflowProfileLoader } from "../core/profile/WorkflowProfileLoader.ts";
import { parseArgs } from "./args.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.profile) throw new Error("Missing --profile");

const loader = new WorkflowProfileLoader();
const { profile } = await loader.loadProfile(args.profile);
const validation = await loader.validateProfile(profile);
if (!validation.valid) {
  throw new Error(`Cannot activate invalid profile ${args.profile}: ${validation.errors.join("; ")}`);
}
const result = await loader.useProfile(args.profile);
console.log(`activeProfile: ${result.activeProfile}`);
console.log(`updated: ${result.path}`);
if (validation.warnings.length > 0) console.log(`warnings: ${validation.warnings.join("; ")}`);
