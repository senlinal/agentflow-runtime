import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { OpenCodeSessionFileTracker } from "../adapters/opencode/OpenCodeSessionFileTracker.ts";

describe("OpenCodeSessionFileTracker", () => {
  it("tracks created files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tracker-"));
    const tracker = new OpenCodeSessionFileTracker(dir);

    tracker.markCreated("tmp/file.txt");

    assert.equal(tracker.isCreatedInSession("tmp/file.txt"), true);
    assert.equal(tracker.listCreatedFiles().length, 1);
  });

  it("keeps stable state after deletion is marked", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tracker-"));
    const tracker = new OpenCodeSessionFileTracker(dir);

    tracker.markCreated("tmp/file.txt");
    tracker.markDeleted("tmp/file.txt");

    assert.equal(tracker.isCreatedInSession("tmp/file.txt"), true);
    assert.equal(tracker.listDeletedFiles().length, 1);
  });

  it("normalizes relative and absolute paths consistently", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tracker-"));
    const tracker = new OpenCodeSessionFileTracker(dir);
    const absolute = join(dir, "tmp/file.txt");

    tracker.markCreated("tmp/file.txt");

    assert.equal(tracker.isCreatedInSession(absolute), true);
  });
});
