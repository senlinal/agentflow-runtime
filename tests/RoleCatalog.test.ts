import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { RoleCatalog } from "../core/RoleCatalog.ts";

describe("RoleCatalog", () => {
  it("loads roles from roles directory", async () => {
    const roles = await new RoleCatalog().listRoles();
    assert.ok(roles.some((role) => role.id === "planner"));
  });

  it("gets planner by id", async () => {
    const role = await new RoleCatalog().getRoleById("planner");
    assert.equal(role.role, "Planner");
  });

  it("gets Planner by role name", async () => {
    const role = await new RoleCatalog().getRoleByRoleName("Planner");
    assert.equal(role.id, "planner");
  });

  it("ignores non-json files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "role-catalog-"));
    await writeFile(join(dir, "planner.json"), JSON.stringify(validRole()), "utf8");
    await writeFile(join(dir, "notes.txt"), "not json", "utf8");
    const roles = await new RoleCatalog(dir).listRoles();
    assert.equal(roles.length, 1);
  });

  it("fails when outputSchema is missing", () => {
    const role: any = validRole();
    delete role.outputSchema;
    assert.throws(() => new RoleCatalog().validateRole(role, "role"), /outputSchema is required/);
  });

  it("fails when outputSchema is unsupported", () => {
    assert.throws(
      () => new RoleCatalog().validateRole({ ...validRole(), outputSchema: "BadSchema" }, "role"),
      /outputSchema is unsupported/,
    );
  });

  it("allows llm defaultType for opt-in real model roles", () => {
    const role = new RoleCatalog().validateRole({ ...validRole(), defaultType: "llm" }, "role");
    assert.equal(role.defaultType, "llm");
  });
});

function validRole() {
  return {
    id: "planner",
    role: "Planner",
    description: "plan",
    defaultType: "mock",
    defaultInputKeys: ["taskBrief"],
    defaultOutputKey: "plan",
    outputSchema: "Plan",
    defaultSystemPrompt: "plan",
  };
}
