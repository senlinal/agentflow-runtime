import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConditionEvaluator } from "../core/ConditionEvaluator.ts";
import { createInitialContext } from "../core/context.ts";

describe("ConditionEvaluator", () => {
  const evaluator = new ConditionEvaluator();
  const context = {
    ...createInitialContext({ taskId: "test", userGoal: "test" }),
    verification: {
      pass: true,
      score: 1,
      failedCriteria: [],
      reason: "ok",
      nextAction: "end" as const,
      feedbackToPlanner: "done",
    },
  };

  it("always returns true", () => {
    assert.equal(evaluator.evaluate({ type: "always" }, context).matched, true);
  });

  it("equals can evaluate verification.pass", () => {
    assert.equal(
      evaluator.evaluate({ type: "equals", path: "verification.pass", value: true }, context).matched,
      true,
    );
    assert.equal(
      evaluator.evaluate({ type: "equals", path: "verification.pass", value: false }, context).matched,
      false,
    );
  });

  it("exists can detect present fields", () => {
    assert.equal(evaluator.evaluate({ type: "exists", path: "verification.pass" }, context).matched, true);
  });

  it("notExists can detect missing fields", () => {
    assert.equal(evaluator.evaluate({ type: "notExists", path: "does.not.exist" }, context).matched, true);
  });

  it("invalid paths do not crash", () => {
    assert.doesNotThrow(() => evaluator.evaluate({ type: "exists", path: "missing.path" }, context));
    assert.equal(evaluator.evaluate({ type: "exists", path: "missing.path" }, context).matched, false);
  });

  it("in returns true when value is included", () => {
    const result = evaluator.evaluate(
      { type: "in", path: "verification.nextAction", value: ["end", "replan"] },
      context,
    );
    assert.equal(result.matched, true);
  });

  it("in returns false when value is not included", () => {
    const result = evaluator.evaluate({ type: "in", path: "verification.nextAction", value: ["replan"] }, context);
    assert.equal(result.matched, false);
  });

  it("in returns false when path does not exist", () => {
    const result = evaluator.evaluate({ type: "in", path: "missing.path", value: ["end"] }, context);
    assert.equal(result.matched, false);
  });

  it("in throws a clear error when value is not an array", () => {
    assert.throws(
      () => evaluator.evaluate({ type: "in", path: "verification.nextAction", value: "end" }, context),
      /value must be an array/,
    );
  });
});
