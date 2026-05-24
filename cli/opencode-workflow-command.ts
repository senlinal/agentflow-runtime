import { loadDotenv } from "../core/EnvLoader.ts";
import { ProfileWorkflowRunner, type ProfileWorkflowRunResult } from "../core/profile/ProfileWorkflowRunner.ts";

loadDotenv();

const parsed = parseWorkflowCommandArgs(process.argv.slice(2));
const result = await runQuietly(() =>
  new ProfileWorkflowRunner().run({
    profileId: parsed.profileId,
    task: parsed.task,
    dryRun: false,
    allowExecution: false,
  })
);

console.log(parsed.compact ? formatCompact(result) : result.formattedText);

type ParsedWorkflowCommandArgs = {
  profileId?: string;
  task: string;
  compact: boolean;
};

function parseWorkflowCommandArgs(argv: string[]): ParsedWorkflowCommandArgs {
  const compact = argv.includes("--compact");
  const tokens = argv.map((token) => token.trim()).filter((token) => token && token !== "--compact");
  if (tokens[0] === "run" && tokens[1]) {
    return {
      profileId: tokens[1],
      task: tokens.slice(2).join(" ").trim() || "演示 AgentFlow 多角色协作",
      compact,
    };
  }
  return { task: tokens.join(" ").trim() || "演示 AgentFlow 多角色协作", compact };
}

function formatCompact(result: ProfileWorkflowRunResult): string {
  const roleLines = result.roleTimeline
    .filter((event) => event.source === "runtime_trace")
    .map((event, index) => [
      `${index + 1}. ${event.role}`,
      `[${event.status}]`,
      `node=${event.nodeId}`,
      `executor=${event.executorType ?? event.type ?? "unknown"}`,
      `subagent=${event.openCodeSubAgentName ? `@${event.openCodeSubAgentName}` : "n/a"}`,
      `summary=${oneLine(event.summary ?? "n/a", 120)}`,
    ].join(" | "));

  return [
    "AgentFlow Runtime",
    `User command: /workflow ${result.taskBrief.rawUserInput ?? result.taskBrief.goal}`,
    `Profile: ${result.profileId} (${result.profileName})`,
    `Status: ${result.finalStatus}`,
    `Runtime proof: started=${result.runtimeProof.runtimeStarted}, roles=${result.runtimeProof.verifiedRoleCount}, source=${result.runtimeProof.roleSource}`,
    `Dispatch targets: ${dispatchTargets(result).join(", ") || "none"}`,
    "",
    "Role Progress",
    ...(roleLines.length > 0 ? roleLines : ["- No runtime trace roles were verified."]),
    "",
    "Artifacts",
    `summary: ${result.summaryPath ?? "n/a"}`,
    `trace: ${result.tracePath ?? "n/a"}`,
    `context: ${result.contextPath ?? "n/a"}`,
    "",
    "Notes",
    result.roleTimeline.some((event) => event.isMock)
      ? "- Mock nodes are simulations. Use llm or subagent-backed execution for real role intelligence."
      : "- Runtime roles are not inferred from prose; they come from trace.json.",
  ].join("\n");
}

function dispatchTargets(result: ProfileWorkflowRunResult): string[] {
  return [...new Set(result.roleTimeline.map((event) => event.openCodeSubAgentName).filter(Boolean).map((name) => `@${name}`))];
}

function oneLine(value: string, limit: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

async function runQuietly<T>(callback: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const captured: string[] = [];
  console.log = (...items: unknown[]) => captured.push(items.map(String).join(" "));
  console.warn = (...items: unknown[]) => captured.push(items.map(String).join(" "));
  try {
    return await callback();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    if (process.env.AGENTFLOW_DEBUG_PROFILE_RUNNER === "1" && captured.length > 0) {
      console.error(captured.join("\n"));
    }
  }
}
