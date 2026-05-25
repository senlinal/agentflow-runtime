import type { RoleSpeech, RoleSpeechTranscript } from "../types.ts";

export class RoleSpeechFormatter {
  format(transcript: RoleSpeechTranscript): string {
    const lines = [
      "AgentFlow 角色发言流",
      "",
      `Task: ${transcript.task ?? "n/a"}`,
      `Profile: ${transcript.profileId ?? "n/a"}`,
      "",
      ...(transcript.speeches.length > 0
        ? transcript.speeches.flatMap((speech) => formatSpeech(speech))
        : ["- unavailable: no subagent speech artifacts were verified"]),
    ];
    return lines.join("\n");
  }
}

function formatSpeech(speech: RoleSpeech): string[] {
  return [
    speech.title ?? titleFor(speech),
    speech.speech,
    `artifact: ${speech.artifactPath ?? "unavailable"}`,
    `source: ${speech.source}`,
    "",
  ];
}

function titleFor(speech: RoleSpeech): string {
  if (speech.isLLMBacked) return `${speech.role} [llm-backed]`;
  if (speech.isMock) return `${speech.role} [mock simulation]`;
  return speech.role;
}

export function formatRoleSpeechTranscript(transcript: RoleSpeechTranscript): string {
  return new RoleSpeechFormatter().format(transcript);
}
