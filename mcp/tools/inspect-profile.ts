import { WorkflowProfileLoader } from "../../core/profile/WorkflowProfileLoader.ts";

export async function agentflowInspectProfile(
  input: { profile?: string },
  loader = new WorkflowProfileLoader(),
): Promise<{
  profile: unknown;
  sourcePath: string;
  validation: unknown;
  workflowChain: string[];
}> {
  if (!input.profile) throw new Error("agentflow_inspect_profile requires profile.");
  const { profile, sourcePath } = await loader.loadProfile(input.profile);
  const validation = await loader.validateProfile(profile);
  return {
    profile,
    sourcePath,
    validation,
    workflowChain: loader.resolveProfileWorkflowChain(profile),
  };
}
