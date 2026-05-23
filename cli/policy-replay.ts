import { parseArgs } from "./args.ts";
import { PolicyReplayRunner } from "../adapters/opencode/PolicyReplayRunner.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.id) throw new Error("Missing --id");

const result = await new PolicyReplayRunner().run(args.id, { execute: args.execute === "true" });
console.log(JSON.stringify({
  replayId: result.replayId,
  originalDecisionId: result.originalDecisionId,
  mode: result.mode,
  status: result.status,
  replayable: result.plan.replayable,
  reason: result.reason,
  toolCallHash: result.plan.toolCallHash,
  toolName: result.plan.toolName,
  command: result.plan.command,
  affectedPaths: result.plan.affectedPaths,
  exitCode: result.exitCode,
  consumedAt: result.plan.consumedAt,
  replayLogPath: result.replayLogPath,
  nextStep: result.mode === "dry-run" && result.plan.replayable ? "Pass --execute to run the original approved tool call." : null,
}, null, 2));
