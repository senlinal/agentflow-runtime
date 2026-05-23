import { TaskBriefLoader } from "../core/TaskBriefLoader.ts";
import { MemoryAutonomyGate } from "../core/profile/MemoryAutonomyGate.ts";
import { ProjectMemoryStore } from "../core/profile/ProjectMemoryStore.ts";
import { formatAutonomyDecision } from "../core/profile/ProjectMemoryFormatter.ts";
import { parseArgs } from "./args.ts";

const args = parseArgs(process.argv.slice(2));
const profileId = args.profile ?? "rag-optimization";
const store = new ProjectMemoryStore(args.baseDir);
const compacted = await store.getCompacted(profileId) ?? (await store.compact(profileId)).summary;
const taskBrief = args.input
  ? await TaskBriefLoader.loadJson(args.input)
  : TaskBriefLoader.fromObject({
    goal: args.task ?? "Evaluate whether the profile workflow can continue.",
    currentState: "Provided through memory autonomy CLI.",
    constraints: [],
    resources: [],
    budget: "not specified",
    successCriteria: ["Return an autonomy decision."],
    nonGoals: [],
    rawUserInput: args.task,
  }, `autonomy-${profileId}`);

const decision = new MemoryAutonomyGate().evaluate({
  taskBrief,
  compactMemory: compacted,
  proposedAction: args.action ?? args.task,
  dryRun: args.dryRun === "true",
});

console.log(formatAutonomyDecision(decision, args.format === "json" ? "json" : "text"));
