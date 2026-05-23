import { readPath } from "./context.ts";
import type { WorkflowCondition, WorkflowContext } from "./types.ts";

export type ConditionEvaluation = {
  matched: boolean;
  reason: string;
};

export class ConditionEvaluator {
  evaluate(condition: WorkflowCondition | undefined, context: WorkflowContext): ConditionEvaluation {
    if (!condition) {
      return { matched: true, reason: "always: implicit default" };
    }

    if (!condition.type) {
      throw new Error("Invalid condition: missing type.");
    }

    switch (condition.type) {
      case "always":
        return { matched: true, reason: "always" };

      case "equals": {
        if (!condition.path) {
          throw new Error("Invalid equals condition: missing path.");
        }
        if (!("value" in condition)) {
          throw new Error(`Invalid equals condition for ${condition.path}: missing value.`);
        }
        const actual = readPath(context, condition.path);
        return {
          matched: actual === condition.value,
          reason: `${condition.path} equals ${JSON.stringify(condition.value)} actual=${JSON.stringify(actual)}`,
        };
      }

      case "exists": {
        if (!condition.path) {
          throw new Error("Invalid exists condition: missing path.");
        }
        const actual = readPath(context, condition.path);
        return {
          matched: actual !== undefined && actual !== null,
          reason: `${condition.path} exists actual=${JSON.stringify(actual)}`,
        };
      }

      case "notExists": {
        if (!condition.path) {
          throw new Error("Invalid notExists condition: missing path.");
        }
        const actual = readPath(context, condition.path);
        return {
          matched: actual === undefined || actual === null,
          reason: `${condition.path} notExists actual=${JSON.stringify(actual)}`,
        };
      }

      case "in": {
        if (!condition.path) {
          throw new Error("Invalid in condition: missing path.");
        }
        if (!Array.isArray(condition.value)) {
          throw new Error(`Invalid in condition for ${condition.path}: value must be an array.`);
        }
        const actual = readPath(context, condition.path);
        return {
          matched: actual !== undefined && condition.value.includes(actual),
          reason: `${condition.path} in ${JSON.stringify(condition.value)} actual=${JSON.stringify(actual)}`,
        };
      }

      default:
        throw new Error(`Unsupported condition type: ${(condition as { type?: string }).type}`);
    }
  }
}
