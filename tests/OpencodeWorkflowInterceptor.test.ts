import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AgentFlowWorkflowInterceptor } from "../.opencode/plugins/agentflow-workflow-interceptor.ts";
import {
  buildToolInstruction,
  extractFormattedText,
  fallbackText,
  parseAgentFlowEntry,
  parseWorkflowCommand,
  type WorkflowToolCaller,
} from "../adapters/opencode/AgentFlowWorkflowInterceptorCore.ts";

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

  it("parses explicit no-mock workflow text as LLM-backed opt-in", () => {
    assert.deepEqual(parseAgentFlowEntry("/workflow 不要mock 给我解释咖啡的相关知识"), {
      profile: "agent-workforce-llm",
      task: "给我解释咖啡的相关知识",
      allowLLM: true,
    });
    assert.deepEqual(parseAgentFlowEntry("agentflow --allow-llm 给我解释咖啡的相关知识"), {
      profile: "agent-workforce-llm",
      task: "给我解释咖啡的相关知识",
      allowLLM: true,
    });
  });

  it("parses agentflow run profile task text", () => {
    assert.deepEqual(parseAgentFlowEntry("agentflow run agent-workforce-basic 演示 Planner、Debater、Executor、Verifier 多角色协作"), {
      profile: "agent-workforce-basic",
      task: "演示 Planner、Debater、Executor、Verifier 多角色协作",
    });
    assert.deepEqual(parseAgentFlowEntry("agentflow run agent-workforce-llm 给我解释咖啡的相关知识"), {
      profile: "agent-workforce-llm",
      task: "给我解释咖啡的相关知识",
      allowLLM: true,
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

  it("turns /workflow into a visible MCP tool instruction", async () => {
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

    assert.deepEqual(calls, []);
    assert.equal(output.parts.length, 1);
    assert.equal(output.parts[0].type, "text");
    assert.match(String(output.parts[0].text), /agentflow_run_profile_workflow/);
    assert.match(String(output.parts[0].text), /"profile":"agent-workforce-basic"/);
    assert.match(String(output.parts[0].text), /"allowLLM":false/);
    assert.match(String(output.parts[0].text), /display only `formattedText` exactly/);
  });

  it("turns plugin-owned agentflow chat messages into MCP tool instructions", async () => {
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

    assert.deepEqual(calls, []);
    assert.match(String(output.parts[0].text), /agentflow_run_profile_workflow/);
    assert.match(String(output.parts[0].text), /"task":"检查 garbage_item_upload 项目目前有什么不足"/);
    assert.match(String(output.parts[0].text), /"allowExecution":false/);
  });

  it("keeps /workflow command executions on the safe basic profile", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const hooks = await AgentFlowWorkflowInterceptor({
      toolCaller: async (name, args) => {
        calls.push({ name, args });
        return { formattedText: "AgentFlow 工作流完成\n说明: 本次为 mock subagent simulation" };
      },
    });
    const output = { parts: [] as Array<Record<string, unknown>> };

    await hooks["command.execute.before"]({
      command: "workflow",
      arguments: "不要mock 给我解释咖啡的相关知识",
    }, output);

    assert.deepEqual(calls, []);
    assert.match(String(output.parts[0].text), /"profile":"agent-workforce-basic"/);
    assert.match(String(output.parts[0].text), /"allowLLM":false/);
  });

  it("uses the explicit /workflow-llm command for real LLM opt-in", async () => {
    const hooks = await AgentFlowWorkflowInterceptor();
    const output = { parts: [] as Array<Record<string, unknown>> };

    await hooks["command.execute.before"]({
      command: "workflow-llm",
      arguments: "给我解释咖啡的相关知识",
    }, output);

    assert.match(String(output.parts[0].text), /"profile":"agent-workforce-llm"/);
    assert.match(String(output.parts[0].text), /"allowLLM":true/);
  });

  it("includes explicit CLI fallback in the visible instruction", async () => {
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
    assert.match(text, /If the MCP tool is unavailable/);
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

  it("intercepts /agentflow command executions as a hard command path", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const hooks = await AgentFlowWorkflowInterceptor({
      toolCaller: async (name, args) => {
        calls.push({ name, args });
        return { formattedText: "AgentFlow Runtime\nRuntime Proof\nRole Timeline" };
      },
    });
    const output = { parts: [] as Array<Record<string, unknown>> };

    await hooks["command.execute.before"]({
      command: "agentflow",
      arguments: "检查项目不足",
    }, output);

    assert.deepEqual(calls, []);
    assert.match(String(output.parts[0].text), /agentflow_run_profile_workflow/);
    assert.match(String(output.parts[0].text), /"task":"检查项目不足"/);
  });

  it("builds the exact visible instruction for the model/MCP path", () => {
    const instruction = buildToolInstruction({
      profile: "agent-workforce-llm",
      task: "给我解释咖啡的相关知识",
      allowLLM: true,
    });

    assert.match(instruction, /agentflow_run_profile_workflow/);
    assert.match(instruction, /"profile":"agent-workforce-llm"/);
    assert.match(instruction, /"allowLLM":true/);
    assert.match(instruction, /display only `formattedText` exactly/);
  });

  it("captures workflow tool output and replaces final text with formattedText", async () => {
    const hooks = await AgentFlowWorkflowInterceptor();
    const output = {
      metadata: {
        structuredContent: {
          formattedText: "AgentFlow Runtime\nAgentFlow 角色发言流\nPlanner [mock simulation]",
        },
      },
    };
    await hooks["tool.execute.after"]({
      tool: "agentflow_agentflow_run_profile_workflow",
      sessionID: "session",
      callID: "call",
      args: {},
    }, output);
    const complete = { text: "Workflow 完成，经过 5 个角色。" };

    await hooks["experimental.text.complete"]({ sessionID: "session" }, complete);

    assert.equal(complete.text, "AgentFlow Runtime\nAgentFlow 角色发言流\nPlanner [mock simulation]");
  });

  it("extracts formattedText from MCP-style output strings", () => {
    assert.equal(
      extractFormattedText(JSON.stringify({ formattedText: "AgentFlow Runtime\nRole Speech" })),
      "AgentFlow Runtime\nRole Speech",
    );
  });
});
