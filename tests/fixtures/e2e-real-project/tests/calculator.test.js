import assert from "node:assert/strict";
import { add, multiply } from "../src/calculator.ts";

assert.equal(add(1, 2), 3);
assert.equal(add(-2, 5), 3);
assert.equal(multiply(3, 4), 12);
