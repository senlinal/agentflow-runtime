import assert from "node:assert/strict";
import { capitalize, reverse } from "../src/string-utils.ts";

assert.equal(capitalize("agentflow"), "Agentflow");
assert.equal(capitalize(""), "");
assert.equal(reverse("runtime"), "emitnur");
