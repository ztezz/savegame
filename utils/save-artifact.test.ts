import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import { hashFile, sanitizeOriginalFilename } from "./save-artifact.js";

test("hashFile returns the actual byte count and lowercase SHA-256", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "save-artifact-"));
  const filePath = path.join(directory, "save.bin");
  const content = Buffer.from([0, 1, 2, 250, 255]);
  try {
    await writeFile(filePath, content);
    const result = await hashFile(filePath);
    assert.deepEqual(result, {
      fileSize: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("sanitizeOriginalFilename removes paths and control characters", () => {
  assert.equal(sanitizeOriginalFilename("C:\\Users\\player\\save\u0000.zip"), "save.zip");
  assert.equal(sanitizeOriginalFilename("../../profile.tar.gz"), "profile.tar.gz");
  assert.equal(sanitizeOriginalFilename(".."), null);
});
