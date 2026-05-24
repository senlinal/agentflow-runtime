import { WorkflowProfileLoader } from "../../core/profile/WorkflowProfileLoader.ts";

export async function agentflowListProfiles(
  loader = new WorkflowProfileLoader(),
): Promise<{
  profiles: Array<{
    id: string;
    name: string;
    description: string;
    defaultWorkflow: string;
    scopeWorkflow: string | null;
    sourcePath: string;
    warnings: string[];
  }>;
}> {
  const profiles = await loader.listProfiles();
  return {
    profiles: profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      description: profile.description,
      defaultWorkflow: profile.defaultWorkflow,
      scopeWorkflow: profile.scopeWorkflow ?? null,
      sourcePath: profile.sourcePath,
      warnings: profile.warnings,
    })),
  };
}
