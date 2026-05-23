import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ToolCallHasher } from "../adapters/opencode/ToolCallHasher.ts";

describe("ToolCallHasher", () => {
  it("returns the same hash for object keys in different orders", () => {
    const left = ToolCallHasher.hash({
      toolName: "bash",
      toolArgs: { b: 2, a: 1 },
      command: "echo ok",
      affectedPaths: ["b.txt", "a.txt"],
      projectRoot: "/tmp/project",
    });
    const right = ToolCallHasher.hash({
      toolName: "bash",
      toolArgs: { a: 1, b: 2 },
      command: "echo ok",
      affectedPaths: ["a.txt", "b.txt"],
      projectRoot: "/tmp/project",
    });

    assert.equal(left.hash, right.hash);
  });

  it("changes hash when command changes", () => {
    const left = ToolCallHasher.hash({ toolName: "bash", toolArgs: {}, command: "rm a", projectRoot: "/tmp/project" });
    const right = ToolCallHasher.hash({ toolName: "bash", toolArgs: {}, command: "rm b", projectRoot: "/tmp/project" });

    assert.notEqual(left.hash, right.hash);
  });
});
