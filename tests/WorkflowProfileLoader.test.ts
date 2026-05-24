import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WorkflowProfileLoader } from "../core/profile/WorkflowProfileLoader.ts";

test("WorkflowProfileLoader", async (t) => {
  await t.test("lists built-in profiles", async () => {
    const profiles = await new WorkflowProfileLoader().listProfiles();
    assert.ok(profiles.some((profile) => profile.id === "rag-optimization"));
    assert.ok(profiles.some((profile) => profile.id === "coding-safe-fix"));
    assert.ok(profiles.some((profile) => profile.id === "external-project-fix"));
    assert.ok(profiles.some((profile) => profile.id === "frontend-site-build"));
    assert.ok(profiles.some((profile) => profile.id === "agent-workforce-basic"));
    assert.ok(profiles.some((profile) => profile.id === "agent-workforce-llm"));
  });

  await t.test("loads current profile", async () => {
    const resolved = await new WorkflowProfileLoader().loadCurrentProfile();
    assert.equal(resolved.current.activeProfile, "rag-optimization");
    assert.equal(resolved.profile.defaultWorkflow, "task-negotiation");
    assert.ok(resolved.workflowChain.includes("confirmed-scope-gate"));
    assert.ok(resolved.validation.valid);
  });

  await t.test("loads each built-in profile", async () => {
    const loader = new WorkflowProfileLoader();
    assert.equal((await loader.loadProfile("rag-optimization")).profile.defaultWorkflow, "task-negotiation");
    assert.equal((await loader.loadProfile("coding-safe-fix")).profile.defaultWorkflow, "code-test-verify");
    assert.equal((await loader.loadProfile("external-project-fix")).profile.externalProjectMode, "copy_to_temp_workspace");
    assert.equal((await loader.loadProfile("frontend-site-build")).profile.defaultWorkflow, "task-negotiation");
    assert.equal((await loader.loadProfile("agent-workforce-basic")).profile.defaultWorkflow, "abcde-basic");
    assert.equal((await loader.loadProfile("agent-workforce-llm")).profile.defaultWorkflow, "abcde-basic-llm");
  });

  await t.test("fails when current activeProfile does not exist", async () => {
    const dir = await makeProfileDir({
      "current.json": { activeProfile: "missing-profile" },
    });
    await assert.rejects(
      () => new WorkflowProfileLoader(dir).loadCurrentProfile(),
      /Workflow profile not found: missing-profile/,
    );
  });

  await t.test("fails when defaultWorkflow is missing", async () => {
    const loader = new WorkflowProfileLoader();
    const result = await loader.validateProfile(validProfile({ defaultWorkflow: "not-a-workflow" }));
    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /defaultWorkflow references missing workflow/);
  });

  await t.test("fails when scopeWorkflow is missing", async () => {
    const result = await new WorkflowProfileLoader().validateProfile(validProfile({ scopeWorkflow: "not-a-scope-workflow" }));
    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /scopeWorkflow references missing workflow/);
  });

  await t.test("fails when defaultInput is missing", async () => {
    const result = await new WorkflowProfileLoader().validateProfile(validProfile({ defaultInput: "inputs/not-found.json" }));
    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /defaultInput references missing file/);
  });

  await t.test("fails when policyFiles are missing", async () => {
    const result = await new WorkflowProfileLoader().validateProfile(validProfile({ policyFiles: ["docs/not-found-policy.md"] }));
    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /policyFiles references missing file/);
  });

  await t.test("warns when memoryFiles are missing", async () => {
    const result = await new WorkflowProfileLoader().validateProfile(validProfile({ memoryFiles: ["docs/not-found-memory.md"] }));
    assert.equal(result.valid, true);
    assert.match(result.warnings.join("\n"), /Memory file not found/);
  });

  await t.test("fails when profile id is missing", async () => {
    const result = await new WorkflowProfileLoader().validateProfile({ ...validProfile(), id: "" });
    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /profile.id is required/);
  });

  await t.test("fails when profile contains absolute local paths", async () => {
    const result = await new WorkflowProfileLoader().validateProfile(validProfile({ defaultInput: "/tmp/local-task.json" }));
    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /project-relative/);
  });

  await t.test("fails when profile contains secret-like fields", async () => {
    const result = await new WorkflowProfileLoader().validateProfile({
      ...validProfile(),
      provider: { apiKey: "replace-with-test-value" },
    } as never);
    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /secret-like field/);
  });

  await t.test("can switch current profile in a temp profile directory", async () => {
    const dir = await makeProfileDir({
      "current.json": { activeProfile: "alpha" },
      "alpha.json": validProfile({ id: "alpha", name: "Alpha" }),
      "beta.json": validProfile({ id: "beta", name: "Beta", defaultWorkflow: "code-test-verify" }),
    });
    const loader = new WorkflowProfileLoader(dir);
    assert.equal((await loader.loadCurrentProfile()).profile.id, "alpha");
    await loader.useProfile("beta");
    assert.equal((await loader.loadCurrentProfile()).profile.id, "beta");
  });
});

function validProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "profile-test",
    name: "Profile Test",
    description: "Test profile",
    defaultWorkflow: "task-negotiation",
    scopeWorkflow: "confirmed-scope-gate",
    followupWorkflows: ["research-feasibility-execute-verify"],
    defaultInput: "inputs/task-negotiation-rag-task.json",
    scopeInput: "inputs/rag-scope-confirmation-input.json",
    policyFiles: ["docs/AGENT_POLICY.md"],
    memoryFiles: [],
    defaultConstraints: ["confirm_scope"],
    defaultBlockedActions: ["delete_files"],
    autonomyMode: "balanced",
    defaultOutput: ["summary"],
    ...overrides,
  };
}

async function makeProfileDir(files: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agentflow-profiles-"));
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), `${JSON.stringify(content, null, 2)}\n`);
  }
  return dir;
}
