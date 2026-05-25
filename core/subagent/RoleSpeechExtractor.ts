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
  void base;
  return truncate(normalize(speech), 1200);
}

function speechFromOutput(role: string, output: unknown): string | null {
  if (typeof output === "string") return output;
  if (!isRecord(output)) return null;
  switch (role) {
    case "Planner":
      return plannerSpeech(output);
    case "Debater":
      return debaterSpeech(output);
    case "PlannerRevision":
      return plannerRevisionSpeech(output);
    case "Executor":
      return executorSpeech(output);
    case "Verifier":
      return verifierSpeech(output);
    case "GoalKeeper":
      return goalKeeperSpeech(output);
    default:
      return genericSpeech(output);
  }
}

function plannerSpeech(output: Record<string, unknown>): string | null {
  const taskUnderstanding = humanize(stringField(output, "taskUnderstanding"));
  const approach = humanize(stringField(output, "proposedApproach"));
  const deliverablePlan = humanize(stringField(output, "deliverablePlan") ?? stringField(output, "summary"));
  const steps = stepsList(output).map(phrase);
  return joinParts(
    taskUnderstanding ? `我理解这个任务是：${sentence(taskUnderstanding)}` : null,
    approach ? `我的处理思路是：${sentence(approach)}` : null,
    deliverablePlan ? `交付计划是：${sentence(deliverablePlan)}` : null,
    steps.length > 0 ? `计划分为：${steps.join("；")}。` : null,
  );
}

function debaterSpeech(output: Record<string, unknown>): string | null {
  const critique = humanize(stringField(output, "critique"));
  const issues = listItems(output, "issues").map(phrase);
  const risks = listItems(output, "risks").map(phrase);
  const missing = listItems(output, "missingRequirements").map(phrase);
  const concerns = [...listItems(output, "concerns"), ...listItems(output, "objections")].map(phrase);
  const suggestions = [...listItems(output, "suggestions"), ...listItems(output, "recommendations")].map(phrase);
  return joinParts(
    critique ? `我对 Planner 的方案有以下批判：${sentence(critique)}` : null,
    issues.length > 0 ? `主要问题是：${issues.join("；")}。` : null,
    risks.length > 0 ? `风险在于：${risks.join("；")}。` : null,
    missing.length > 0 ? `还缺少：${missing.join("；")}。` : null,
    concerns.length > 0 ? `我还担心：${concerns.join("；")}。` : null,
    suggestions.length > 0 ? `建议补充：${suggestions.join("；")}。` : null,
  );
}

function plannerRevisionSpeech(output: Record<string, unknown>): string | null {
  const summary = humanize(stringField(output, "summary") ?? stringField(output, "revisedPlan"));
  const notes = [...listItems(output, "revisionNotes"), ...listItems(output, "changes")].map(phrase);
  const accepted = listItems(output, "basedOnCritique").map(phrase);
  const finalPlan = humanize(stringField(output, "finalPlan"));
  const steps = stepsList(output).map(phrase);
  const summaryLine = summary
    ? summary.startsWith("我已") ? sentence(summary) : `我已根据 Debater 的意见修订计划：${sentence(summary)}`
    : "我已根据 Debater 的意见修订计划。";
  return joinParts(
    summaryLine,
    accepted.length > 0 ? `采纳的批评包括：${accepted.join("；")}。` : null,
    notes.length > 0 ? `本次调整是：${notes.join("；")}。` : null,
    finalPlan ? `最终计划是：${sentence(finalPlan)}` : null,
    steps.length > 0 ? `修订后的步骤为：${steps.join("；")}。` : null,
  );
}

function executorSpeech(output: Record<string, unknown>): string | null {
  const deliverable = humanize(deliverableSpeech(output));
  const summary = humanize(stringField(output, "executionSummary") ?? stringField(output, "summary"));
  const completed = listItems(output, "completedSteps").map(phrase);
  const evidence = listItems(output, "evidenceOfCompletion").map(phrase);
  return joinParts(
    deliverable ? `我开始执行修订计划，当前交付物是：${deliverable}` : null,
    summary && !deliverable ? `我完成的执行结果是：${sentence(summary)}` : summary ? sentence(summary) : null,
    completed.length > 0 ? `已完成步骤：${completed.join("；")}。` : null,
    evidence.length > 0 ? `完成证据：${evidence.join("；")}。` : null,
  );
}

function verifierSpeech(output: Record<string, unknown>): string | null {
  const status = [
    typeof output.answersUserRequest === "boolean" ? `answersUserRequest=${output.answersUserRequest}` : null,
    typeof output.isNotMetaOnly === "boolean" ? `isNotMetaOnly=${output.isNotMetaOnly}` : null,
    typeof output.pass === "boolean" ? `pass=${output.pass}` : null,
    typeof output.score === "number" ? `score=${output.score}` : null,
  ].filter((item): item is string => Boolean(item));
  const failed = listItems(output, "failedCriteria");
  const summary = humanize(stringField(output, "verificationSummary") ?? stringField(output, "reason"));
  const feedback = humanize(stringField(output, "feedbackToPlanner"));
  return joinParts(
    `我检查了交付物${status.length > 0 ? `，${status.join(" / ")}` : ""}。`,
    summary ? sentence(summary) : null,
    failed.length > 0 ? `未通过项：${failed.join("；")}。` : null,
    feedback ? `给 Planner 的反馈：${sentence(feedback)}` : null,
  );
}

function goalKeeperSpeech(output: Record<string, unknown>): string | null {
  const reminder = humanize(stringField(output, "originalGoalReminder") ?? stringField(output, "correctionHint") ?? stringField(output, "reason"));
  const instructions = listItems(output, "correctionInstructions").map(phrase);
  const failed = listItems(output, "failedCriteria").map(phrase);
  const nextAction = humanize(stringField(output, "recommendedNextAction") ?? stringField(output, "recommendedDirection"));
  return joinParts(
    reminder ? `我回看原始目标：${sentence(reminder)}` : null,
    failed.length > 0 ? `当前失败点是：${failed.join("；")}。` : null,
    instructions.length > 0 ? `下一轮需要：${instructions.join("；")}。` : null,
    nextAction ? `建议动作：${sentence(nextAction)}` : null,
  );
}

function deliverableSpeech(output: Record<string, unknown>): string | null {
  const deliverable = output.deliverable;
  if (!isRecord(deliverable)) return null;
  const content = stringField(deliverable, "content");
  if (!content) return null;
  return content;
}

function stepsList(output: Record<string, unknown>): string[] {
  const steps = output.steps;
  if (!Array.isArray(steps)) return [];
  return steps.map((step) => {
    if (typeof step === "string") return step;
    if (isRecord(step)) return stringField(step, "action") ?? stringField(step, "expectedOutput");
    return null;
  }).filter((item): item is string => Boolean(item));
}

function genericSpeech(output: Record<string, unknown>): string | null {
  return stringField(output, "summary")
    ?? stringField(output, "reason")
    ?? stringField(output, "rawOutput")
    ?? (Object.keys(output).length > 0 ? JSON.stringify(output) : null);
}

function listItems(output: Record<string, unknown>, key: string): string[] {
  const value = output[key];
  if (!Array.isArray(value) || value.length === 0) return [];
  return value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).filter(Boolean);
}

function stringField(output: Record<string, unknown>, key: string): string | null {
  const value = output[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function joinParts(...parts: Array<string | null | undefined>): string | null {
  const text = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part)).join(" ");
  return text || null;
}

function sentence(value: string): string {
  const text = normalize(value);
  return /[。.!?？]$/.test(text) ? text : `${text}。`;
}

function phrase(value: string): string {
  return humanize(value).replace(/[。.!?？]+$/u, "");
}

function humanize(value: string | null): string {
  if (!value) return "";
  const request = extractUserRequest(value);
  if (value.startsWith("The user needs") && request) return `用户需要我直接回答“${request}”`;
  if (value.startsWith("Produce a answer with concrete content for:") && request) return `输出一份围绕“${request}”的可直接使用答案`;
  if (value.startsWith("Plan to produce the requested deliverable for:") && request) return `围绕“${request}”制定可交付答案`;
  if (value.startsWith("Revised plan focused on the user deliverable for:") && request) return `把计划重新聚焦到“${request}”这个用户交付物`;
  if (value.startsWith("Produced a concrete answer for:") && request) return `已经生成“${request}”的具体答案`;
  const dictionary: Record<string, string> = {
    "Answer the user request directly, cover the stated requirements, and avoid workflow-only meta narration.": "直接回答用户问题，覆盖明确要求，避免只讲工作流过程",
    "Identify the real user question": "识别用户真正的问题",
    "Cover required answer elements": "覆盖必要回答要素",
    "Write the actual deliverable content, not a description of having done it.": "写出真实交付内容，而不是描述已经完成",
    "Check that deliverable.content directly satisfies the user request and is not meta-only.": "检查 deliverable.content 是否直接满足用户请求，并且不是空壳元叙述",
    "The final answer must contain the requested content itself, not just say the workflow completed.": "最终回答必须包含用户要的内容本身，不能只说工作流完成了",
    "The plan should explicitly check the original user request and expected deliverable.": "计划需要显式核对原始用户请求和期望交付物",
    "A generic role output could look multi-agent but fail to answer the user.": "通用角色输出可能看起来像多 Agent 协作，但没有真正回答用户",
    "Make Executor produce deliverable.content and make Verifier reject meta-only content.": "让 Executor 产出 deliverable.content，并让 Verifier 拒绝空壳元叙述",
    "Re-centered the plan on the expected deliverable and original user request.": "把计划重新对齐到期望交付物和原始用户请求",
    "Deliverable content exists, answers the original user request, and is not meta-only.": "交付物内容存在，回答了原始用户请求，并且不是空壳元叙述",
    "No further replanning required.": "不需要继续返工",
    "deliverable.content is present and non-empty.": "deliverable.content 存在且非空",
    "understand_request": "理解请求",
    "cover_requirements": "覆盖需求",
    "produce_deliverable": "生成交付物",
    "verify_deliverable_fidelity": "验证交付物质量",
  };
  let result = value;
  for (const [from, to] of Object.entries(dictionary)) result = result.replaceAll(from, to);
  result = result.replace(/^Original userRequest preserved: /, "保留原始用户请求：");
  result = result.replace(/^Expected deliverable type: /, "期望交付物类型：");
  result = result.replace(/: clear explanation, important concepts or steps, practical caveats when useful, concise summary\./g, "：清楚解释、关键概念或步骤、必要注意事项和简短总结。");
  return result;
}

function extractUserRequest(value: string): string | null {
  const match = value.match(/(?:user's request:|for:)\s*(.+)$/i);
  return match?.[1]?.trim() ?? null;
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
