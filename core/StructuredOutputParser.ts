export class StructuredOutputParser {
  static parseJsonObject(rawText: string): unknown {
    const normalized = stripCodeFence(rawText.trim());
    const direct = tryParse(normalized);
    if (direct.ok) return direct.value;

    const extracted = extractFirstJsonObject(normalized);
    if (extracted) {
      const parsed = tryParse(extracted);
      if (parsed.ok) return parsed.value;
    }

    throw new Error("LLM output did not contain a valid JSON object.");
  }
}

function stripCodeFence(value: string): string {
  const match = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : value;
}

function tryParse(value: string): { ok: true; value: unknown } | { ok: false } {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false };
    return { ok: true, value: parsed };
  } catch {
    return { ok: false };
  }
}

function extractFirstJsonObject(value: string): string | null {
  const start = value.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return null;
}
