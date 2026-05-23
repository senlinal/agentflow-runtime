import { CommandRunner, type CommandRunnerResult } from "./CommandRunner.ts";

export type TestRunnerResult = {
  passed: boolean;
  commands: CommandRunnerResult[];
  summary: string;
  errors: string[];
};

export type TestRunnerOptions = {
  commands?: string[];
  cwd?: string;
  projectRoot?: string;
  timeoutMs?: number;
};

export class TestRunner {
  private readonly commandRunner: CommandRunner;

  constructor(commandRunner = new CommandRunner()) {
    this.commandRunner = commandRunner;
  }

  async run(options: TestRunnerOptions = {}): Promise<TestRunnerResult> {
    const commands = options.commands ?? ["npm run test", "npm run typecheck"];
    const results: CommandRunnerResult[] = [];
    const errors: string[] = [];
    for (const command of commands) {
      const result = await this.commandRunner.run({
        command,
        cwd: options.cwd,
        projectRoot: options.projectRoot,
        timeoutMs: options.timeoutMs,
      });
      results.push(result);
      if (result.timedOut) errors.push(`${command} timed out.`);
      if (result.exitCode !== 0) errors.push(`${command} exited with ${result.exitCode}.`);
    }
    return {
      passed: errors.length === 0,
      commands: results,
      summary: errors.length === 0 ? `All ${commands.length} test command(s) passed.` : `${errors.length} test issue(s) found.`,
      errors,
    };
  }
}
