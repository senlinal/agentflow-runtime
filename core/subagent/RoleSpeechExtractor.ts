import { readFile } from "node:fs/promises";
import type { RoleSpeech, RoleSpeechTranscript, SubAgentDispatchMetadata } from "../types.ts";

export type RoleSpeechTimelineEvent = {
  role: string;
  nodeId: string;
  subAgentId?: string;
  workerSessionId?: string;
  executorType?: string;
  type?: string;
  isMock?: boolean;
  isLLMBacked?: boolean;
  source?: string;
  outputKey?: string;
  outputSchema?: string;
  outputArtifactPath?: string;
  subAgentMetadataPath?: string;
};

export type RoleSpeechExtractorInput = {
  runId: string;
  profileId?: string;
  task?: string;
  roleTimeline: RoleSpeechTimelineEvent[];
};

export class RoleSpeechExtractor {
  async extract(input: RoleSpeechExtractorInput): Promise<RoleSpeechTranscript> {
    const warnings: string[] = [];
    const speeches: RoleSpeech[] = [];
    for (const event of input.roleTimeline.filter(isVerifiedSubAgentEvent)) {
      speeches.push(await this.extractSpeech(event, warnings));
    }
    return {
      runId: input.runId,
      ...(input.profileId ? { profileId: input.profileId } : {}),
      ...(input.task ? { task: input.task } : {}),
      speeches,
      warnings,
      createdAt: new Date().toISOString(),
    };
  }

  private async extractSpeech(event: RoleSpeechTimelineEvent, warnings: string[]): Promise<RoleSpeech> {
    const metadata = await readMetadata(event.subAgentMetadataPath, warnings);
    const base = baseSpeech(event, metadata);
    const outputPath = event.outputArtifactPath ?? metadata?.outputArtifactPath;
    const output = await readJson(outputPath, warnings);
    if (output.ok) {
      const speech = speechFromOutput(event.role, output.value);
      if (speech) {
        return {
          ...base,
          source: "subagent_output",
          speech: withBadge(base, speech),
          artifactPath: output.path,
        };
      }
    }

    const summaryPath = metadata?.summaryPath;
    const summary = await readText(summaryPath, warnings);
    if (summary.ok) {
      return {
        ...base,
        source: "subagent_summary",
        speech: withBadge(base, cleanSummary(summary.value)),
        artifactPath: summary.path,
      };
    }

    return {
      ...base,
      source: "unavailable",
      speech: withBadge(base, "Role speech unavailable because no readable subagent output.json or summary.md artifact was found."),
      ...(outputPath ?? summaryPath ? { artifactPath: outputPath ?? summaryPath } : {}),
    };
  }
}

function isVerifiedSubAgentEvent(event: RoleSpeechTimelineEvent): boolean {
  return event.source === "subagent_dispatch_trace" && Boolean(event.subAgentId);
}

function baseSpeech(event: RoleSpeechTimelineEvent, metadata?: SubAgentDispatchMetadata): Omit<RoleSpeech, "source" | "speech" | "artifactPath"> {
  const isLLMBacked = event.isLLMBacked === true && metadata?.isLLMBacked !== false;
  const isMock = event.isMock === true || metadata?.isMock === true;
  const role = event.role;
  const badge = isLLMBacked ? " [llm-backed]" : isMock ? " [mock simulation]" : "";
  return {
    role,
    nodeId: event.nodeId,
    subAgentId: event.subAgentId ?? metadata?.subAgentId ?? "unavailable",
    workerSessionId: event.workerSessionId ?? metadata?.workerSessionId ?? "unavailable",
    executorType: event.executorType ?? event.type ?? metadata?.executorType ?? "unknown",
    isMock,
    isLLMBacked,
    title: `${role}${badge}`,
    ...(event.outputKey ? { outputKey: event.outputKey } : metadata?.outputKey ? { outputKey: String(metadata.outputKey) } : {}),
    ...(event.outputSchema ? { outputSchema: event.outputSchema } : metadata?.outputSchema ? { outputSchema: metadata.outputSchema } : {}),
    ...(metadata?.completedAt ?? metadata?.startedAt ? { createdAt: metadata.completedAt ?? metadata.startedAt } : {}),
  };
}

function withBadge(base: Pick<RoleSpeech, "isMock" | "isLLMBacked">, speech: string): string {
  const badge = base.isLLMBacked ? "[llm-backed]" : base.isMock ? "[mock simulation]" : "";
  return truncate(`${badge ? `${badge} ` : ""}${normalize(speech)}`, 900);
}

function speechFromOutput(role: string, output: unknown): string | null {
  if (typeof output === "string") return output;
  if (!isRecord(output)) return null;
  switch (role) {
    case "Planner":
      return joinParts(
        stringField(output, "taskUnderstanding"),
        stringField(output, "proposedApproach"),
        stringField(output, "deliverablePlan"),
        stringField(output, "summary"),
        stepsSpeech(output),
      );
    case "Debater":
      return joinParts(
        stringField(output, "critique"),
        listSpeech(output, "issues", "Issues"),
        listSpeech(output, "risks", "Risks"),
        listSpeech(output, "missingRequirements", "Missing requirements"),
        listSpeech(output, "concerns", "Concerns"),
        listSpeech(output, "objections", "Objections"),
        listSpeech(output, "suggestions", "Suggestions"),
        listSpeech(output, "recommendations", "Recommendations"),
      );
    case "PlannerRevision":
      return joinParts(
        stringField(output, "summary"),
        stringField(output, "revisedPlan"),
        listSpeech(output, "revisionNotes", "Revision notes"),
        listSpeech(output, "basedOnCritique", "Accepted critique"),
        listSpeech(output, "changes", "Changes"),
        stringField(output, "finalPlan"),
        stepsSpeech(output),
      );
    case "Executor":
      return joinParts(
        deliverableSpeech(output),
        stringField(output, "executionSummary"),
        stringField(output, "summary"),
        listSpeech(output, "completedSteps", "Completed steps"),
        listSpeech(output, "evidenceOfCompletion", "Evidence"),
      );
    case "Verifier":
      return verifierSpeech(output);
    case "GoalKeeper":
      return joinParts(
        stringField(output, "correctionHint"),
        stringField(output, "reason"),
        stringField(output, "originalGoalReminder"),
        listSpeech(output, "correctionInstructions", "Correction instructions"),
        listSpeech(output, "failedCriteria", "Failed criteria"),
        stringField(output, "recommendedDirection"),
        stringField(output, "recommendedNextAction"),
      );
    default:
      return genericSpeech(output);
  }
}

function verifierSpeech(output: Record<string, unknown>): string | null {
  const fields = [
    typeof output.pass === "boolean" ? `pass=${output.pass}` : null,
    typeof output.score === "number" ? `score=${output.score}` : null,
    typeof output.answersUserRequest === "boolean" ? `answersUserRequest=${output.answersUserRequest}` : null,
    typeof output.isNotMetaOnly === "boolean" ? `isNotMetaOnly=${output.isNotMetaOnly}` : null,
    listSpeech(output, "failedCriteria", "Failed criteria"),
    stringField(output, "verificationSummary"),
    stringField(output, "reason"),
    stringField(output, "feedbackToPlanner"),
  ];
  return joinParts(...fields);
}

function deliverableSpeech(output: Record<string, unknown>): string | null {
  const deliverable = output.deliverable;
  if (!isRecord(deliverable)) return null;
  const content = stringField(deliverable, "content");
  const type = stringField(deliverable, "type");
  if (!content) return null;
  return type ? `Deliverable (${type}): ${content}` : content;
}

function stepsSpeech(output: Record<string, unknown>): string | null {
  const steps = output.steps;
  if (!Array.isArray(steps)) return null;
  const actions = steps.map((step) => {
    if (typeof step === "string") return step;
    if (isRecord(step)) return stringField(step, "action") ?? stringField(step, "expectedOutput");
    return null;
  }).filter((item): item is string => Boolean(item));
  return actions.length > 0 ? `Steps: ${actions.join("; ")}` : null;
}

function genericSpeech(output: Record<string, unknown>): string | null {
  return stringField(output, "summary")
    ?? stringField(output, "reason")
    ?? stringField(output, "rawOutput")
    ?? (Object.keys(output).length > 0 ? JSON.stringify(output) : null);
}

function listSpeech(output: Record<string, unknown>, key: string, label: string): string | null {
  const value = output[key];
  if (!Array.isArray(value) || value.length === 0) return null;
  const items = value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).filter(Boolean);
  return items.length > 0 ? `${label}: ${items.join("; ")}` : null;
}

function stringField(output: Record<string, unknown>, key: string): string | null {
  const value = output[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function joinParts(...parts: Array<string | null | undefined>): string | null {
  const text = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part)).join(" ");
  return text || null;
}

function cleanSummary(value: string): string {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const outputIndex = lines.findIndex((line) => line === "## Output Preview");
  return outputIndex >= 0 ? lines.slice(outputIndex + 1).join(" ") : lines.join(" ");
}

async function readMetadata(path: string | undefined, warnings: string[]): Promise<SubAgentDispatchMetadata | undefined> {
  const result = await readJson(path, warnings, false);
  if (!result.ok || !isRecord(result.value)) return undefined;
  return result.value as SubAgentDispatchMetadata;
}

async function readJson(path: string | undefined, warnings: string[], warn = true): Promise<{ ok: true; path: string; value: unknown } | { ok: false }> {
  if (!path) return { ok: false };
  try {
    return { ok: true, path, value: JSON.parse(await readFile(path, "utf8")) };
  } catch (error) {
    if (warn) warnings.push(`Unable to read JSON artifact ${path}: ${errorMessage(error)}`);
    return { ok: false };
  }
}

async function readText(path: string | undefined, warnings: string[]): Promise<{ ok: true; path: string; value: string } | { ok: false }> {
  if (!path) return { ok: false };
  try {
    return { ok: true, path, value: await readFile(path, "utf8") };
  } catch (error) {
    warnings.push(`Unable to read text artifact ${path}: ${errorMessage(error)}`);
    return { ok: false };
  }
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
