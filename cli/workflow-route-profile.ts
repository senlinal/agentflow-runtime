import { ProfileRouter } from "../core/profile/ProfileRouter.ts";
import { WorkflowProfileLoader } from "../core/profile/WorkflowProfileLoader.ts";
import { parseArgs } from "./args.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.task) {
  throw new Error("workflow:route-profile requires --task");
}

const loader = new WorkflowProfileLoader();
const current = await loader.loadCurrentProfile();
const decision = new ProfileRouter().route({
  task: args.task,
  currentProfile: current.profile.id,
  explicitProfile: args.profile,
});

if (args.format === "json") {
  console.log(JSON.stringify(decision, null, 2));
} else {
  console.log(`currentProfile: ${decision.currentProfile}`);
  console.log(`detectedTaskType: ${decision.detectedTaskType}`);
  console.log(`recommendedProfile: ${decision.recommendedProfile ?? "none"}`);
  console.log(`confidence: ${decision.confidence}`);
  console.log(`shouldSwitch: ${decision.shouldSwitch}`);
  console.log(`safeToAutoSwitch: ${decision.safeToAutoSwitch}`);
  console.log(`reason: ${decision.reason}`);
  console.log(`warnings: ${decision.warnings.join("; ") || "none"}`);
}
