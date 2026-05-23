import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { FileOperationClassifier } from "../adapters/opencode/FileOperationClassifier.ts";
import { OpenCodeSessionFileTracker } from "../adapters/opencode/OpenCodeSessionFileTracker.ts";

describe("FileOperationClassifier", () => {
  it("allows creating a new file", async () => {
    const { classifier } = await makeClassifier();
    assert.equal(classifier.classify({ type: "create", path: "new.txt" }).action, "allow");
  });

  it("allows modifying an existing file", async () => {
    const { classifier } = await makeClassifier();
    assert.equal(classifier.classify({ type: "modify", path: "existing.txt" }).action, "allow");
  });

  it("asks before deleting an existing file", async () => {
    const { classifier } = await makeClassifier();
    assert.equal(classifier.classify({ type: "delete", path: "existing.txt" }).action, "ask");
  });

  it("allows deleting a session-created file", async () => {
    const { classifier, tracker } = await makeClassifier();
    tracker.markCreated("temp.txt");
    assert.equal(classifier.classify({ type: "delete", path: "temp.txt" }).action, "allow");
  });

  it("asks for project-external path", async () => {
    const { classifier } = await makeClassifier();
    assert.equal(classifier.classify({ type: "modify", path: "/etc/passwd" }).action, "ask");
  });

  it("asks for writing .env", async () => {
    const { classifier } = await makeClassifier();
    assert.match(classifier.classify({ type: "write", path: ".env" }).action, /ask|deny/);
  });
});

async function makeClassifier(): Promise<{ classifier: FileOperationClassifier; tracker: OpenCodeSessionFileTracker }> {
  const dir = await mkdtemp(join(tmpdir(), "file-risk-"));
  await writeFile(join(dir, "existing.txt"), "x", "utf8");
  const tracker = new OpenCodeSessionFileTracker(dir);
  return { classifier: new FileOperationClassifier(dir, tracker), tracker };
}
