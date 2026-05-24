import { tool } from "@opencode-ai/plugin";
import { OpenCodeWorkflowToolService } from "../../adapters/opencode/OpenCodeWorkflowToolService.ts";
import type { ProfileWorkflowRunRequest } from "../../core/profile/ProfileWorkflowRunner.ts";

export default tool({
  description: "Run AgentFlow Runtime through the active workflow profile and return the formatted role timeline.",
  args: {
    task: tool.schema.string().optional().describe("User task to run through the active or routed workflow profile."),
    profile: tool.schema.string().optional().describe("Optional profile id to use explicitly."),
    inputPath: tool.schema.string().optional().describe("Optional TaskBrief input path."),
    resume: tool.schema.boolean().optional().describe("Whether this is a scope confirmation resume."),
    sessionId: tool.schema.string().optional().describe("Optional profile session id for resume."),
    answer: tool.schema.string().optional().describe("User answer to pending scope questions."),
    dryRun: tool.schema.boolean().optional().describe("Preview without running even safe profile preflight roles."),
    allowExecution: tool.schema.boolean().optional().describe("Allow execution-capable workflows. Defaults to false."),
  },
  async execute(args) {
    return new OpenCodeWorkflowToolService().runProfileWorkflow(args as ProfileWorkflowRunRequest);
  },
});
