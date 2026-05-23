import { TestRunner } from "./TestRunner.ts";
import type { AgentNode, ExecutionResult, NodeExecutor, WorkflowContext } from "../types.ts";

type TestExecutorConfig = {
  commands?: string[];
  cwd?: string;
  projectRoot?: string;
  timeoutMs?: number;
};

export class TestExecutor implements NodeExecutor {
  private readonly testRunner: TestRunner;

  constructor(testRunner = new TestRunner()) {
    this.testRunner = testRunner;
  }

  async execute(node: AgentNode, _context: WorkflowContext): Promise<ExecutionResult> {
    const config = normalizeConfig(node.executorConfig);
    const result = await this.testRunner.run(config);
    return {
      status: result.passed ? "passed" : "failed",
      completedSteps: result.commands.map((command) => `Ran ${[command.command, ...command.args].join(" ")}`),
      artifacts: [],
      summary: result.summary,
      errors: result.errors,
      rawOutput: JSON.stringify(result, null, 2),
    };
  }
}

function normalizeConfig(raw: unknown): TestExecutorConfig {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return {
    commands: Array.isArray(record.commands) ? record.commands.filter((item): item is string => typeof item === "string") : undefined,
    cwd: typeof record.cwd === "string" ? record.cwd : undefined,
    projectRoot: typeof record.projectRoot === "string" ? record.projectRoot : undefined,
    timeoutMs: typeof record.timeoutMs === "number" ? record.timeoutMs : undefined,
  };
}
