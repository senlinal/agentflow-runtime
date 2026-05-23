import { WorkflowProfileLoader } from "../core/profile/WorkflowProfileLoader.ts";

const profiles = await new WorkflowProfileLoader().listProfiles();
for (const profile of profiles) {
  console.log(`${profile.id}\t${profile.name}\t${profile.defaultWorkflow}\t${profile.scopeWorkflow ?? "none"}\t${profile.sourcePath}\t${profile.description}`);
}
