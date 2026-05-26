import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fallbackText,
  parseAgentFlowEntry,
  runWorkflowEntry,
  type WorkflowToolCaller,
} from "../adapters/opencode/AgentFlowWorkflowInterceptorCore.ts";

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

  it("parses native pack and collect entries", () => {
    assert.deepEqual(parseAgentFlowEntry("agentflow native-pack 解释一下咖啡的做法"), {
      mode: "native-pack",
      profile: "agent-workforce-basic",
      task: "解释一下咖啡的做法",
    });
    assert.deepEqual(parseAgentFlowEntry("agentflow native-pack run agent-workforce-basic 解释一下咖啡的做法"), {
      mode: "native-pack",
      profile: "agent-workforce-basic",
      task: "解释一下咖啡的做法",
    });
    assert.deepEqual(parseAgentFlowEntry("agentflow native-collect 2026-run"), {
      mode: "native-collect",
      profile: "agent-workforce-basic",
      runId: "2026-run",
      task: "2026-run",
    });
  });

  it("parses explicit LLM opt-in entries", () => {
    assert.deepEqual(parseAgentFlowEntry("agentflow llm 给我解释咖啡的相关知识"), {
      profile: "agent-workforce-llm",
      task: "给我解释咖啡的相关知识",
      allowLLM: true,
    });
    assert.deepEqual(parseAgentFlowEntry("agentflow 不要mock 给我解释咖啡的相关知识"), {
      profile: "agent-workforce-llm",
      task: "给我解释咖啡的相关知识",
      allowLLM: true,
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

  it("calls native pack and native collect MCP tools", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const caller: WorkflowToolCaller = async (name, args) => {
      calls.push({ name, args });
      return { formattedText: name === "agentflow_native_pack" ? "AgentFlow Native Workflow Pack 已生成" : "AgentFlow Native Workflow Collect" };
    };

    assert.equal(
      await runWorkflowEntry(caller, parseAgentFlowEntry("agentflow native-pack 解释 RAG 流程")!),
      "AgentFlow Native Workflow Pack 已生成",
    );
    assert.equal(
      await runWorkflowEntry(caller, parseAgentFlowEntry("agentflow native-collect run-123")!),
      "AgentFlow Native Workflow Collect",
    );
    assert.deepEqual(calls, [
      { name: "agentflow_native_pack", args: { profile: "agent-workforce-basic", task: "解释 RAG 流程" } },
      { name: "agentflow_native_collect", args: { run: "run-123" } },
    ]);
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

  it("passes allowLLM=true for explicit LLM entries", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const caller: WorkflowToolCaller = async (name, args) => {
      calls.push({ name, args });
      return { formattedText: "AgentFlow 工作流完成\n说明: 本次包含 LLM-backed agent" };
    };

    const result = await runWorkflowEntry(caller, parseAgentFlowEntry("agentflow llm 给我解释咖啡的相关知识")!);

    assert.match(result, /LLM-backed agent/);
    assert.deepEqual(calls, [{
      name: "agentflow_run_profile_workflow",
      args: {
        profile: "agent-workforce-llm",
        task: "给我解释咖啡的相关知识",
        allowExecution: false,
        allowLLM: true,
      },
    }]);
  });
});
