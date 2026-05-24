import { ProfileWorkflowRunner } from "../core/profile/ProfileWorkflowRunner.ts";

const parsed = parseWorkflowCommandArgs(process.argv.slice(2));
const result = await runQuietly(() =>
  new ProfileWorkflowRunner().run({
    profileId: parsed.profileId,
    task: parsed.task,
    dryRun: false,
    allowExecution: false,
  })
);

console.log(result.formattedText);

type ParsedWorkflowCommandArgs = {
  profileId?: string;
  task: string;
};

function parseWorkflowCommandArgs(argv: string[]): ParsedWorkflowCommandArgs {
  const tokens = argv.map((token) => token.trim()).filter(Boolean);
  if (tokens[0] === "run" && tokens[1]) {
    return {
      profileId: tokens[1],
      task: tokens.slice(2).join(" ").trim() || "演示 AgentFlow 多角色协作",
    };
  }
  return { task: tokens.join(" ").trim() || "演示 AgentFlow 多角色协作" };
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
