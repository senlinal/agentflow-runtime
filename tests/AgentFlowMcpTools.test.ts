import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { callAgentFlowTool } from "../mcp/agentflow-mcp-server.ts";

describe("AgentFlow MCP tools", () => {
  it("runs agent-workforce-basic through MCP and returns runtime proof", async () => {
    const result = await callAgentFlowTool("agentflow_run_profile_workflow", {
      profile: "agent-workforce-basic",
      task: "演示 Planner、Debater、Executor、Verifier 多角色协作",
    }) as {
      formattedText: string;
      runtimeProof: { runtimeStarted: boolean; verifiedRoleCount: number; roleSource: string };
      roleTimeline: Array<{ role: string; source: string }>;
      summaryPath?: string;
      tracePath?: string;
      contextPath?: string;
    };

    assert.match(result.formattedText, /AgentFlow Profile Run/);
    assert.match(result.formattedText, /Runtime Proof/);
    assert.equal(result.runtimeProof.runtimeStarted, true);
    assert.equal(result.runtimeProof.roleSource, "runtime_trace");
    assert.equal(result.runtimeProof.verifiedRoleCount > 1, true);
    assert.equal(result.roleTimeline.every((event) => event.source === "runtime_trace"), true);
    assert.ok(result.roleTimeline.some((event) => event.role === "Planner"));
    assert.ok(result.summaryPath?.endsWith("summary.md"));
    assert.ok(result.tracePath?.endsWith("trace.json"));
    assert.ok(result.contextPath?.endsWith("context.json"));
  });

  it("blocks agent-workforce-llm by default when allowLLM=false", async () => {
    const result = await callAgentFlowTool("agentflow_run_profile_workflow", {
      profile: "agent-workforce-llm",
      task: "演示 LLM 多角色协作",
    }) as {
      blocked: true;
      formattedText: string;
      runtimeProof: { runtimeStarted: boolean; verifiedRoleCount: number; roleSource: string };
      roleTimeline: unknown[];
      warnings: string[];
    };

    assert.equal(result.blocked, true);
    assert.equal(result.runtimeProof.runtimeStarted, false);
    assert.equal(result.runtimeProof.verifiedRoleCount, 0);
    assert.equal(result.runtimeProof.roleSource, "unavailable");
    assert.deepEqual(result.roleTimeline, []);
    assert.match(result.formattedText, /allowLLM=false/);
    assert.match(result.warnings.join("\n"), /allowLLM=false/);
  });

  it("lists and inspects profiles", async () => {
    const listed = await callAgentFlowTool("agentflow_list_profiles") as {
      profiles: Array<{ id: string }>;
    };
    assert.ok(listed.profiles.some((profile) => profile.id === "agent-workforce-basic"));

    const inspected = await callAgentFlowTool("agentflow_inspect_profile", {
      profile: "agent-workforce-basic",
    }) as {
      profile: { id: string };
      workflowChain: string[];
    };
    assert.equal(inspected.profile.id, "agent-workforce-basic");
    assert.deepEqual(inspected.workflowChain, ["abcde-basic"]);
  });

  it("supports show last run without throwing", async () => {
    const result = await callAgentFlowTool("agentflow_show_last_run") as { found: boolean };
    assert.equal(typeof result.found, "boolean");
  });
});
