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
    allowLLM: parsed.allowLLM,
  })
);

console.log(parsed.compact ? formatCompact(result) : result.formattedText);

type ParsedWorkflowCommandArgs = {
  profileId?: string;
  task: string;
  compact: boolean;
  allowLLM: boolean;
};

function parseWorkflowCommandArgs(argv: string[]): ParsedWorkflowCommandArgs {
  const compact = argv.includes("--compact");
  const rawTokens = argv.map((token) => token.trim()).filter(Boolean);
  const allowLLM = rawTokens.includes("--allow-llm") || rawTokens.includes("--allowLLM");
  let profileId: string | undefined;
  const tokens: string[] = [];
  for (let index = 0; index < rawTokens.length; index += 1) {
    const token = rawTokens[index];
    if (token === "--compact" || token === "--allow-llm" || token === "--allowLLM") continue;
    if ((token === "--profile" || token === "--profileId") && rawTokens[index + 1]) {
      profileId = rawTokens[index + 1];
      index += 1;
      continue;
    }
    tokens.push(token);
  }
  if (tokens[0] === "run" && tokens[1]) {
    return {
      profileId: profileId ?? tokens[1],
      task: tokens.slice(2).join(" ").trim() || "演示 AgentFlow 多角色协作",
      compact,
      allowLLM,
    };
  }
  return {
    profileId,
    task: tokens.join(" ").trim() || "演示 AgentFlow 多角色协作",
    compact,
    allowLLM,
  };
}

function formatCompact(result: ProfileWorkflowRunResult): string {
  const roleLines = result.roleTimeline
    .filter(isVerifiedRoleEvent)
    .map((event, index) => [
      `${index + 1}. ${event.role}`,
      `[${event.status}]`,
      `node=${event.nodeId}`,
      `executor=${event.executorType ?? event.type ?? "unknown"}`,
      `source=${event.source ?? "unknown"}`,
      `llm=${event.isLLMBacked === true}`,
      event.modelProvider ? `model=${event.modelProvider}/${event.modelName ?? "unknown"}` : null,
      event.callStatus ? `call=${event.callStatus}` : null,
      `subagent=${event.openCodeSubAgentName ? `@${event.openCodeSubAgentName}` : "n/a"}`,
      event.nextNode ? `next=${event.nextNode}` : null,
      `summary=${oneLine(event.summary ?? "n/a", 120)}`,
    ].filter(Boolean).join(" | "));

  return [
    "AgentFlow Runtime",
    `User command: /workflow ${result.taskBrief.rawUserInput ?? result.taskBrief.goal}`,
    `Profile: ${result.profileId} (${result.profileName})`,
    `Status: ${result.finalStatus}`,
    `Allow LLM: ${result.allowLLM}`,
    `Runtime proof: started=${result.runtimeProof.runtimeStarted}, roles=${result.runtimeProof.verifiedRoleCount}, source=${result.runtimeProof.roleSource}`,
    `Dispatch targets: ${dispatchTargets(result).join(", ") || "none"}`,
    "",
    "Role Coordination",
    ...coordinationLines(result),
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
  return [...new Set(result.roleTimeline.filter(isVerifiedRoleEvent).map((event) => event.openCodeSubAgentName).filter(Boolean).map((name) => `@${name}`))];
}

function coordinationLines(result: ProfileWorkflowRunResult): string[] {
  const events = result.roleTimeline.filter(isVerifiedRoleEvent);
  if (events.length === 0) return ["- none"];
  return events.map((event) =>
    `- ${event.role} -> ${event.nextNode ?? "end"} (${event.status}; ${event.executorType ?? event.type ?? "unknown"})`
  );
}

function isVerifiedRoleEvent(event: ProfileWorkflowRunResult["roleTimeline"][number]): boolean {
  return event.source === "runtime_trace" || event.source === "subagent_dispatch_trace";
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
