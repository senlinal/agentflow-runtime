import assert from "node:assert/strict";
import { callAgentFlowTool } from "../mcp/agentflow-mcp-server.ts";

const result = await callAgentFlowTool("agentflow_run_profile_workflow", {
  profile: "agent-workforce-basic",
  task: "演示 Planner、Debater、Executor、Verifier 多角色协作",
  allowExecution: false,
  allowLLM: false,
}) as {
  formattedText?: string;
  runtimeProof?: { runtimeStarted?: boolean; verifiedRoleCount?: number; roleSource?: string };
  roleTimeline?: unknown[];
};

assert.equal(typeof result.formattedText, "string");
assert.equal(result.runtimeProof?.runtimeStarted, true);
assert.equal(result.runtimeProof?.roleSource, "subagent_dispatch_trace");
assert.equal((result.runtimeProof?.verifiedRoleCount ?? 0) > 1, true);
assert.equal((result.roleTimeline?.length ?? 0) > 1, true);

console.log(result.formattedText);
