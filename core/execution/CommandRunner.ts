import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { isInsidePath } from "./PathSafety.ts";

export type CommandRunnerResult = {
  command: string;
  args: string[];
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
};

export type CommandRunnerOptions = {
  command: string | string[];
  cwd?: string;
  projectRoot?: string;
  timeoutMs?: number;
  maxOutputChars?: number;
  allowedCommands?: string[];
  env?: Record<string, string | undefined>;
};

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_CHARS = 20_000;
const SHELL_METACHARACTER_PATTERN = /(\|\||&&|[|;<>`]|[$][(])/;
const DEFAULT_ALLOWED_PREFIXES = [
  "npm run demo",
  "npm run demo:feasible",
  "npm run demo:infeasible",
  "npm run workflow",
  "npm run workflow:",
  "npm run test",
  "npm run typecheck",
  "npm run verify",
  "npm run repo:check",
  "npm run doctor",
  "npm run release:check",
  "npm run opencode:check",
  "node",
  "git status",
  "git diff",
  "git rev-parse",
];

const DENIED_EXECUTABLES = new Set(["rm", "unlink", "rmdir", "trash", "sudo", "chmod", "chown", "curl", "wget"]);

export class CommandRunner {
  async run(options: CommandRunnerOptions): Promise<CommandRunnerResult> {
    const projectRoot = resolve(options.projectRoot ?? process.cwd());
    const cwd = resolve(options.cwd ?? projectRoot);
    if (!isInsidePath(cwd, projectRoot)) {
      throw new Error(`Command cwd is outside the project root: ${cwd}`);
    }

    const parsed = normalizeCommand(options.command);
    validateCommand(parsed, options.allowedCommands ?? DEFAULT_ALLOWED_PREFIXES);

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxOutputChars = options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
    const startedAt = Date.now();

    return await new Promise<CommandRunnerResult>((resolveResult, reject) => {
      const child = spawn(parsed.command, parsed.args, {
        cwd,
        env: { ...process.env, ...options.env },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout = truncate(`${stdout}${String(chunk)}`, maxOutputChars);
      });
      child.stderr.on("data", (chunk) => {
        stderr = truncate(`${stderr}${String(chunk)}`, maxOutputChars);
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (exitCode) => {
        clearTimeout(timer);
        resolveResult({
          command: parsed.command,
          args: parsed.args,
          cwd,
          exitCode,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
          timedOut,
        });
      });
    });
  }
}

export function normalizeCommand(input: string | string[]): { command: string; args: string[]; display: string } {
  const parts = Array.isArray(input) ? input : splitCommandString(input);
  if (parts.length === 0 || !parts[0]) throw new Error("Command must not be empty.");
  return { command: parts[0], args: parts.slice(1), display: parts.join(" ") };
}

export function validateCommand(command: { command: string; args: string[]; display: string }, allowedPrefixes: string[]): void {
  if (SHELL_METACHARACTER_PATTERN.test(command.display)) {
    throw new Error(`Refusing shell metacharacters in command: ${command.display}`);
  }
  if (DENIED_EXECUTABLES.has(command.command)) {
    throw new Error(`Command executable is not allowed by default: ${command.command}`);
  }
  if (command.command === "git" && command.args[0] === "reset" && command.args.includes("--hard")) {
    throw new Error("git reset --hard is not allowed.");
  }
  if (command.command === "git" && command.args[0] === "clean") {
    throw new Error("git clean is not allowed.");
  }

  const isAllowed = allowedPrefixes.some((prefix) =>
    command.display === prefix || command.display.startsWith(`${prefix} `)
  );
  if (!isAllowed) {
    throw new Error(`Command is not in the allowed command set: ${command.display}`);
  }
}

function splitCommandString(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const parts: string[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if ((char === "'" || char === "\"") && quote === null) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (/\s/.test(char) && quote === null) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (quote !== null) throw new Error("Command contains an unterminated quote.");
  if (current) parts.push(current);
  return parts;
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}
