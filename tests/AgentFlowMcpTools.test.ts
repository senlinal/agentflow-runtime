import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import { callAgentFlowTool } from "../mcp/agentflow-mcp-server.ts";

const execFileAsync = promisify(execFile);

describe("AgentFlow MCP tools", () => {
  it("runs agent-workforce-basic through MCP and returns runtime proof", async () => {
    const result = await callAgentFlowTool("agentflow_run_profile_workflow", {
      profile: "agent-workforce-basic",
      task: "演示 Planner、Debater、Executor、Verifier 多角色协作",
    }) as {
      formattedText: string;
      runtimeProof: { runtimeStarted: boolean; verifiedRoleCount: number; roleSource: string };
      roleTimeline: Array<{ role: string; source: string }>;
      roleSpeechTranscript: { speeches: Array<{ role: string; source: string; speech: string }> };
      summaryPath?: string;
      tracePath?: string;
      contextPath?: string;
    };

    assert.match(result.formattedText, /AgentFlow 工作流完成/);
    assert.match(result.formattedText, /角色发言：/);
    assert.match(result.formattedText, /Planner:/);
    assert.equal(result.runtimeProof.runtimeStarted, true);
    assert.equal(result.runtimeProof.roleSource, "subagent_dispatch_trace");
    assert.equal(result.runtimeProof.verifiedRoleCount > 1, true);
    assert.equal(result.roleTimeline.every((event) => event.source === "subagent_dispatch_trace"), true);
    assert.ok(result.roleTimeline.some((event) => event.role === "Planner"));
    assert.ok(result.roleSpeechTranscript.speeches.some((speech) => speech.role === "Planner" && speech.source === "subagent_output"));
    assert.ok(result.summaryPath?.endsWith("summary.md"));
    assert.ok(result.tracePath?.endsWith("trace.json"));
    assert.ok(result.contextPath?.endsWith("context.json"));
  });

  it("does not fabricate role timeline when an LLM profile is blocked before runtime", async () => {
    const result = await callAgentFlowTool("agentflow_run_profile_workflow", {
      profile: "agent-workforce-llm",
      task: "演示 LLM 多角色协作",
      allowLLM: false,
    }) as {
      blocked: true;
      formattedText: string;
      runtimeProof: { runtimeStarted: boolean; verifiedRoleCount: number; roleSource: string };
      roleTimeline: unknown[];
      roleSpeechTranscript: { speeches: unknown[] };
    };

    assert.equal(result.blocked, true);
    assert.equal(result.runtimeProof.runtimeStarted, false);
    assert.equal(result.runtimeProof.verifiedRoleCount, 0);
    assert.equal(result.runtimeProof.roleSource, "unavailable");
    assert.deepEqual(result.roleTimeline, []);
    assert.deepEqual(result.roleSpeechTranscript.speeches, []);
    assert.doesNotMatch(result.formattedText, /1\\. Planner/);
    assert.doesNotMatch(result.formattedText, /llm-backed subagent execution/);
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
      roleSpeechTranscript: { speeches: unknown[] };
      warnings: string[];
    };

    assert.equal(result.blocked, true);
    assert.equal(result.runtimeProof.runtimeStarted, false);
    assert.equal(result.runtimeProof.verifiedRoleCount, 0);
    assert.equal(result.runtimeProof.roleSource, "unavailable");
    assert.deepEqual(result.roleTimeline, []);
    assert.deepEqual(result.roleSpeechTranscript.speeches, []);
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

  it("loads AgentFlow .env when the MCP server starts outside the project shell", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentflow-mcp-env-"));
    await writeFile(join(root, ".env"), [
      "AGENTFLOW_LLM_PROVIDER=deepseek",
      "AGENTFLOW_DEEPSEEK_API_KEY=test-only-key",
      "AGENTFLOW_DEEPSEEK_MODEL=deepseek-v4-flash",
      "",
    ].join("\n"), "utf8");

    const { stdout } = await execFileAsync("node", [
      "--experimental-strip-types",
      "--input-type=module",
      "--eval",
      [
        `await import(${JSON.stringify(resolve("mcp/agentflow-mcp-server.ts"))});`,
        "const summary = {",
        "  provider: process.env.AGENTFLOW_LLM_PROVIDER,",
        "  hasKey: Boolean(process.env.AGENTFLOW_DEEPSEEK_API_KEY),",
        "  model: process.env.AGENTFLOW_DEEPSEEK_MODEL,",
        "};",
        "console.log(JSON.stringify(summary));",
      ].join("\n"),
    ], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        AGENTFLOW_PROJECT_ROOT: root,
      },
      maxBuffer: 1024 * 1024,
    });

    assert.deepEqual(JSON.parse(stdout), {
      provider: "deepseek",
      hasKey: true,
      model: "deepseek-v4-flash",
    });
    assert.doesNotMatch(stdout, /test-only-key/);
  });
});
