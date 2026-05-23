import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StructuredOutputParser } from "../core/StructuredOutputParser.ts";

describe("StructuredOutputParser", () => {
  it("parses a plain JSON object", () => {
    assert.deepEqual(StructuredOutputParser.parseJsonObject('{"ok":true}'), { ok: true });
  });

  it("parses a fenced JSON object", () => {
    assert.deepEqual(StructuredOutputParser.parseJsonObject('```json\n{"ok":true}\n```'), { ok: true });
  });

  it("extracts the first JSON object from surrounding text", () => {
    assert.deepEqual(StructuredOutputParser.parseJsonObject('Here is JSON:\n{"ok":true}\nDone.'), { ok: true });
  });

  it("rejects arrays and malformed output", () => {
    assert.throws(() => StructuredOutputParser.parseJsonObject("[1,2,3]"), /valid JSON object/);
    assert.throws(() => StructuredOutputParser.parseJsonObject("not json"), /valid JSON object/);
  });
});
