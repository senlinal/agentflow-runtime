import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { TemplateCreateService } from "../core/TemplateCreateService.ts";
import { WorkflowTemplateValidator } from "../core/WorkflowTemplateValidator.ts";

describe("TemplateCreateService", () => {
  it("fails when out file exists and force is false", async () => {
    const outPath = await existingOutPath();
    await assert.rejects(
      () => new TemplateCreateService().create({
        specPath: "template-specs/abcde-basic.json",
        outPath,
        name: "abcde-basic-create-test",
      }),
      /Output file already exists.*--force/,
    );
  });

  it("allows overwrite when force is true", async () => {
    const outPath = await existingOutPath();
    const result = await new TemplateCreateService().create({
      specPath: "template-specs/abcde-basic.json",
      outPath,
      name: `abcde-basic-force-${Date.now()}`,
      force: true,
    });
    assert.equal(result.out, outPath);
  });

  it("fails on template name conflict", async () => {
    const dir = await mkdtemp(join(tmpdir(), "template-create-"));
    await assert.rejects(
      () => new TemplateCreateService().create({
        specPath: "template-specs/abcde-basic.json",
        outPath: join(dir, "new.json"),
      }),
      /Workflow template name already exists: abcde-basic/,
    );
  });

  it("creates a valid template with name override", async () => {
    const dir = await mkdtemp(join(tmpdir(), "template-create-"));
    const outPath = join(dir, "new.json");
    const result = await new TemplateCreateService().create({
      specPath: "template-specs/abcde-basic.json",
      outPath,
      name: `abcde-basic-new-${Date.now()}`,
      description: "Generated test template.",
    });
    const raw = JSON.parse(await readFile(outPath, "utf8"));
    const config = WorkflowTemplateValidator.validate(raw);

    assert.equal(config.workflow.name, result.name);
    assert.equal(config.workflow.description, "Generated test template.");
  });
});

async function existingOutPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "template-create-"));
  const outPath = join(dir, "existing.json");
  await writeFile(outPath, "existing", "utf8");
  return outPath;
}
