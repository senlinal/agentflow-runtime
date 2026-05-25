import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FailureAnalyzer } from "../core/adaptive/FailureAnalyzer.ts";

describe("FailureAnalyzer", () => {
  it("classifies meta-only output as repairable", () => {
    const result = new FailureAnalyzer().analyze({
      verification: {
        pass: false,
        deliverableExists: true,
        answersUserRequest: false,
        isNotMetaOnly: false,
        score: 0.2,
        failedCriteria: ["Deliverable must not be workflow-only or meta-only."],
        reason: "Deliverable fidelity check failed.",
        nextAction: "replan",
        feedbackToPlanner: "Return substantive content.",
      },
    });

    assert.equal(result.failureType, "meta_only_output");
    assert.equal(result.repairable, true);
    assert.equal(result.suggestedRouteId, "add_missing_content");
  });

  it("classifies missing content", () => {
    const result = new FailureAnalyzer().analyze({
      verification: {
        pass: false,
        deliverableExists: false,
        score: 0.1,
        failedCriteria: ["deliverable.content must exist."],
        reason: "Missing content.",
        nextAction: "retry_execute",
        feedbackToPlanner: "Add content.",
      },
    });

    assert.equal(result.failureType, "missing_content");
    assert.equal(result.repairable, true);
  });

  it("classifies repeated route as blocked", () => {
    const result = new FailureAnalyzer().analyze({
      routeId: "direct_deliverable",
      attemptedRouteIds: ["direct_deliverable", "direct_deliverable"],
    });

    assert.equal(result.failureType, "repeated_route");
    assert.equal(result.repairable, false);
    assert.deepEqual(result.blockedReasons, ["repeated_route"]);
  });
});
