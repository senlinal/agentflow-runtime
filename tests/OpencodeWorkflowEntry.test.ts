import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fallbackText,
  parseAgentFlowEntry,
  runWorkflowEntry,
  type WorkflowToolCaller,
} from "../.opencode/plugins/agentflow-workflow-interceptor.ts";

describe("opencode plugin-owned AgentFlow entry", () => {
  it("parses agentflow and @agentflow entries", () => {
    assert.deepEqual(parseAgentFlowEntry("agentflow 检查项目不足"), {
      profile: "agent-workforce-basic",
      task: "检查项目不足",
    });
    assert.deepEqual(parseAgentFlowEntry("@agentflow 检查项目不足"), {
      profile: "agent-workforce-basic",
      task: "检查项目不足",
    });
  });

  it("parses explicit profile runs", () => {
    assert.deepEqual(parseAgentFlowEntry("agentflow run agent-workforce-basic 演示多角色协作"), {
      profile: "agent-workforce-basic",
      task: "演示多角色协作",
    });
  });

  it("calls agentflow_run_profile_workflow with safe defaults", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const caller: WorkflowToolCaller = async (name, args) => {
      calls.push({ name, args });
      return { formattedText: "AgentFlow Runtime\nRuntime Proof\nRole Timeline\ntracePath: /tmp/trace.json" };
    };

    const result = await runWorkflowEntry(caller, parseAgentFlowEntry("agentflow 检查项目不足")!);

    assert.equal(result, "AgentFlow Runtime\nRuntime Proof\nRole Timeline\ntracePath: /tmp/trace.json");
    assert.deepEqual(calls, [{
      name: "agentflow_run_profile_workflow",
      args: {
        profile: "agent-workforce-basic",
        task: "检查项目不足",
        allowExecution: false,
        allowLLM: false,
      },
    }]);
  });

  it("returns CLI fallback without fabricating runtime proof", async () => {
    const result = await runWorkflowEntry(async () => {
      throw new Error("unavailable");
    }, parseAgentFlowEntry("agentflow 检查项目不足")!);

    assert.equal(result, fallbackText("检查项目不足"));
    assert.match(result, /npm run workflow:run-profile -- --profile agent-workforce-basic --task "检查项目不足"/);
    assert.doesNotMatch(result, /<auto-slash-command>/);
    assert.doesNotMatch(result, /Supervisor Research Plan/);
    assert.doesNotMatch(result, /Role Timeline/);
    assert.doesNotMatch(result, /runtimeStarted=true/);
  });
});
