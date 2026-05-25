import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AgentFlowWorkflowInterceptor,
  fallbackText,
  parseAgentFlowEntry,
  parseWorkflowCommand,
  type WorkflowToolCaller,
} from "../.opencode/plugins/agentflow-workflow-interceptor.ts";

describe("opencode workflow interceptor", () => {
  it("parses agentflow task text", () => {
    assert.deepEqual(parseAgentFlowEntry("agentflow 检查 garbage_item_upload 项目目前有什么不足"), {
      profile: "agent-workforce-basic",
      task: "检查 garbage_item_upload 项目目前有什么不足",
    });
  });

  it("parses @agentflow task text", () => {
    assert.deepEqual(parseAgentFlowEntry("@agentflow 检查 garbage_item_upload 项目目前有什么不足"), {
      profile: "agent-workforce-basic",
      task: "检查 garbage_item_upload 项目目前有什么不足",
    });
  });

  it("parses /workflow task text as a best-effort compatibility path", () => {
    assert.deepEqual(parseAgentFlowEntry("/workflow 检查 garbage_item_upload 项目目前有什么不足"), {
      profile: "agent-workforce-basic",
      task: "检查 garbage_item_upload 项目目前有什么不足",
    });
  });

  it("parses agentflow run profile task text", () => {
    assert.deepEqual(parseAgentFlowEntry("agentflow run agent-workforce-basic 演示 Planner、Debater、Executor、Verifier 多角色协作"), {
      profile: "agent-workforce-basic",
      task: "演示 Planner、Debater、Executor、Verifier 多角色协作",
    });
  });

  it("parses resume answer text", () => {
    assert.deepEqual(parseWorkflowCommand("回答上一轮问题：按 heading/file 口径继续"), {
      profile: "agent-workforce-basic",
      resume: true,
      answer: "按 heading/file 口径继续",
      task: "按 heading/file 口径继续",
    });
  });

  it("ignores non-agentflow text", () => {
    assert.equal(parseAgentFlowEntry("请正常分析这个项目"), undefined);
  });

  it("calls agentflow_run_profile_workflow and returns formattedText", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const toolCaller: WorkflowToolCaller = async (name, args) => {
      calls.push({ name, args });
      return {
        formattedText: "AgentFlow Runtime\nRole Timeline\ntrace: /tmp/trace.json",
        runtimeProof: { runtimeStarted: true, verifiedRoleCount: 3, roleSource: "subagent_dispatch_trace" },
      };
    };
    const hooks = await AgentFlowWorkflowInterceptor({ toolCaller });
    const output = { parts: [] as Array<Record<string, unknown>> };

    await hooks["command.execute.before"]({
      command: "workflow",
      arguments: "run agent-workforce-basic 演示 Planner、Debater、Executor、Verifier 多角色协作",
    }, output);

    assert.deepEqual(calls, [{
      name: "agentflow_run_profile_workflow",
      args: {
        profile: "agent-workforce-basic",
        task: "演示 Planner、Debater、Executor、Verifier 多角色协作",
        allowExecution: false,
        allowLLM: false,
      },
    }]);
    assert.equal(output.parts.length, 1);
    assert.equal(output.parts[0].type, "text");
    assert.equal(output.parts[0].text, "AgentFlow Runtime\nRole Timeline\ntrace: /tmp/trace.json");
  });

  it("intercepts plugin-owned agentflow chat messages", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const hooks = await AgentFlowWorkflowInterceptor({
      toolCaller: async (name, args) => {
        calls.push({ name, args });
        return { formattedText: "AgentFlow Runtime\nruntimeStarted=true\nRole Timeline" };
      },
    });
    const output = {
      parts: [{ type: "text", text: "agentflow 检查 garbage_item_upload 项目目前有什么不足" }],
    };

    await hooks["chat.message"]({ sessionID: "test" }, output);

    assert.deepEqual(calls, [{
      name: "agentflow_run_profile_workflow",
      args: {
        profile: "agent-workforce-basic",
        task: "检查 garbage_item_upload 项目目前有什么不足",
        allowExecution: false,
        allowLLM: false,
      },
    }]);
    assert.equal(output.parts[0].text, "AgentFlow Runtime\nruntimeStarted=true\nRole Timeline");
  });

  it("returns explicit CLI fallback when MCP tool is unavailable", async () => {
    const hooks = await AgentFlowWorkflowInterceptor({
      toolCaller: async () => {
        throw new Error("missing tool");
      },
    });
    const output = { parts: [] as Array<Record<string, unknown>> };

    await hooks["command.execute.before"]({
      command: "workflow",
      arguments: "检查 garbage_item_upload 项目目前有什么不足",
    }, output);

    const text = String(output.parts[0].text);
    assert.equal(text, fallbackText("检查 garbage_item_upload 项目目前有什么不足"));
    assert.match(text, /AgentFlow Runtime was not started\./);
    assert.match(text, /agentflow_run_profile_workflow MCP tool is unavailable/);
    assert.match(text, /npm run workflow:run-profile -- --profile agent-workforce-basic --task "检查 garbage_item_upload 项目目前有什么不足"/);
    assert.doesNotMatch(text, /Role Timeline/);
    assert.doesNotMatch(text, /Planner/);
    assert.doesNotMatch(text, /Debater/);
    assert.doesNotMatch(text, /runtimeStarted=true/);
  });

  it("does not intercept other commands", async () => {
    const hooks = await AgentFlowWorkflowInterceptor({
      toolCaller: async () => {
        throw new Error("should not call tool");
      },
    });
    const output = { parts: [] as Array<Record<string, unknown>> };

    await hooks["command.execute.before"]({ command: "other", arguments: "anything" }, output);

    assert.deepEqual(output.parts, []);
  });
});
