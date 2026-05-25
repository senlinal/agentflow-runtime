import { OpenCodeWorkflowToolService } from "../../adapters/opencode/OpenCodeWorkflowToolService.ts";
import { WorkflowProfileLoader } from "../../core/profile/WorkflowProfileLoader.ts";
import { WorkflowTemplateRegistry } from "../../core/WorkflowTemplateRegistry.ts";

export type AgentFlowRunProfileWorkflowInput = {
  task?: string;
  profile?: string;
  inputPath?: string;
  resume?: boolean;
  sessionId?: string;
  answer?: string;
  allowExecution?: boolean;
  allowLLM?: boolean;
};

export type AgentFlowRunProfileWorkflowOutput =
  | Awaited<ReturnType<OpenCodeWorkflowToolService["runProfileWorkflow"]>>
  | {
    blocked: true;
    formattedText: string;
    runtimeProof: {
      runtimeStarted: false;
      verifiedRoleCount: 0;
      roleSource: "unavailable";
    };
    roleTimeline: [];
    roleSpeechTranscript: {
      runId: "unavailable";
      profileId: string;
      speeches: [];
      warnings: string[];
      createdAt: string;
    };
    profileId: string;
    warnings: string[];
    nextActions: string[];
  };

export async function agentflowRunProfileWorkflow(
  input: AgentFlowRunProfileWorkflowInput,
  deps: {
    service?: OpenCodeWorkflowToolService;
    profileLoader?: WorkflowProfileLoader;
    workflowRegistry?: WorkflowTemplateRegistry;
  } = {},
): Promise<AgentFlowRunProfileWorkflowOutput> {
  const service = deps.service ?? new OpenCodeWorkflowToolService();
  const profileLoader = deps.profileLoader ?? new WorkflowProfileLoader();
  const workflowRegistry = deps.workflowRegistry ?? new WorkflowTemplateRegistry();
  const allowExecution = input.allowExecution === true;
  const allowLLM = input.allowLLM === true;
  const profileId = input.profile ?? (await profileLoader.loadCurrentProfile()).profile.id;

  if (await profileUsesLLM(profileId, profileLoader, workflowRegistry) && !allowLLM) {
    return blockedResult(
      profileId,
      "Profile uses LLM-backed nodes and allowLLM=false. AgentFlow Runtime was not started.",
      "Re-run only after explicitly enabling LLM execution and configuring a provider.",
    );
  }

  return service.runProfileWorkflow({
    profile: input.profile,
    task: input.task,
    inputPath: input.inputPath,
    resume: input.resume,
    sessionId: input.sessionId,
    answer: input.answer,
    allowExecution,
    allowLLM,
  });
}

async function profileUsesLLM(
  profileId: string,
  profileLoader: WorkflowProfileLoader,
  workflowRegistry: WorkflowTemplateRegistry,
): Promise<boolean> {
  const { profile } = await profileLoader.loadProfile(profileId);
  for (const workflow of profileLoader.resolveProfileWorkflowChain(profile)) {
    const { config } = await workflowRegistry.load(workflow);
    if (config.nodes.some((node) => node.type === "llm")) return true;
  }
  return false;
}

function blockedResult(profileId: string, reason: string, nextAction: string): AgentFlowRunProfileWorkflowOutput {
  return {
    blocked: true,
    formattedText: [
      "AgentFlow Profile Run",
      "",
      `Active Profile: ${profileId}`,
      "Status: blocked",
      "",
      "Runtime Proof:",
      "- runtimeStarted: false",
      "- verifiedRoleCount: 0",
      "- roleSource: unavailable",
      "",
      "AgentFlow Runtime was not started. This is not a verified multi-agent run.",
      `Reason: ${reason}`,
      "",
      "Next Actions:",
      `- ${nextAction}`,
    ].join("\n"),
    runtimeProof: {
      runtimeStarted: false,
      verifiedRoleCount: 0,
      roleSource: "unavailable",
    },
    roleTimeline: [],
    roleSpeechTranscript: {
      runId: "unavailable",
      profileId,
      speeches: [],
      warnings: [reason],
      createdAt: new Date().toISOString(),
    },
    profileId,
    warnings: [reason],
    nextActions: [nextAction],
  };
}
