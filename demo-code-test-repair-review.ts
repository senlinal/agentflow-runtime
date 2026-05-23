import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { WorkflowRunner } from "./core/WorkflowRunner.ts";
import { WorkflowTemplateRegistry } from "./core/WorkflowTemplateRegistry.ts";
import type { AgentNode, TaskBrief, WorkflowGraphConfig } from "./core/types.ts";

const execFileAsync = promisify(execFile);

const workspace = await createFixtureWorkspace();
const loaded = await new WorkflowTemplateRegistry().load("code-test-verify");
const config = withFailingFixtureConfig(loaded.config, workspace);
const result = await new WorkflowRunner().run(config, taskBrief());

console.log(JSON.stringify({
  workflow: config.workflow.name,
  runId: result.runId,
  verificationPass: result.context.verification?.pass ?? null,
  failureCodes: result.context.verification?.failureCodes ?? [],
  repairPlanSummary: result.context.scopedRepairPlan?.summary ?? null,
  repairPlanRiskLevel: result.context.scopedRepairPlan?.riskLevel ?? null,
  humanApprovalStatus: result.context.humanApprovalRequest?.status ?? null,
  blockedUntilApproved: result.context.humanApprovalRequest?.blockedUntilApproved ?? null,
  traceNodes: result.trace.map((item) => item.nodeId),
  summaryPath: result.summaryPath,
  tracePath: result.tracePath,
}, null, 2));

function withFailingFixtureConfig(config: WorkflowGraphConfig, workspace: string): WorkflowGraphConfig {
  const nodes = config.nodes.map((node): AgentNode => {
    if (node.id === "codeExecutor") {
      return {
        ...node,
        executorConfig: {
          ...node.executorConfig,
          projectRoot: workspace,
          cwd: workspace,
          fileWrites: [{ path: "src/generated.txt", content: "fixture-needs-repair\n" }],
          commands: [],
        },
      };
    }
    if (node.id === "testRunner") {
      return {
        ...node,
        executorConfig: {
          ...node.executorConfig,
          projectRoot: workspace,
          cwd: workspace,
          commands: ["node -e \"process.exit(1)\""],
        },
      };
    }
    return node;
  });
  return { ...config, nodes };
}

async function createFixtureWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "agentflow-repair-review-"));
  await execFileAsync("git", ["init"], { cwd: workspace });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: workspace });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: workspace });
  await writeFile(join(workspace, "README.md"), "# repair fixture\n", "utf8");
  await execFileAsync("git", ["add", "README.md"], { cwd: workspace });
  await execFileAsync("git", ["commit", "-m", "init"], { cwd: workspace });
  return workspace;
}

function taskBrief(): TaskBrief {
  return {
    taskId: "code_test_repair_review_demo",
    goal: "Demonstrate a failed verification producing a scoped repair plan and human approval request.",
    currentState: "Temporary fixture workspace with a clean git repository.",
    constraints: ["Do not call real LLM providers.", "Do not execute repairs automatically.", "Do not delete files."],
    resources: ["CodeExecutor", "TestRunner", "ExecutionVerifier", "RepairPlanBuilder"],
    budget: "low",
    successCriteria: ["Fixture test command passes."],
    nonGoals: ["No automatic repair execution.", "No approval auto-grant."],
  };
}
