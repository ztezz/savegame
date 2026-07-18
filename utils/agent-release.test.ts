import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import {
  agentReleasePath,
  assertAgentVersion,
  publishAgentRelease,
  validateAgentReleaseMetadata,
} from "./agent-release.js";

test("agent versions and digests are strict", () => {
  assert.equal(assertAgentVersion("1.2.3"), "1.2.3");
  for (const value of ["v1.2.3", "1.2", "1.2.3-beta", " 1.2.3", "1.2.3 "]) {
    assert.throws(() => assertAgentVersion(value));
  }
  assert.throws(() => agentReleasePath("uploads", "A".repeat(64)));
  assert.throws(() => agentReleasePath("uploads", "../release"));
});

test("publication writes immutable content before metadata and validation detects tampering", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-release-"));
  const source = path.join(root, "upload.tmp");
  const content = Buffer.from("complete agent bytes");
  let metadataSeenAfterFile = false;
  try {
    await writeFile(source, content);
    const metadata = await publishAgentRelease({
      sourcePath: source,
      uploadsDir: root,
      originalName: "Cloudsave-1.2.3.exe",
      version: "1.2.3",
      expectedSize: content.length,
      persistMetadata: async (value) => {
        metadataSeenAfterFile = (await readFile(agentReleasePath(root, value.sha256))).equals(content);
      },
    });

    assert.equal(metadataSeenAfterFile, true);
    assert.equal(metadata.size, content.length);
    assert.equal(metadata.downloadUrl, `/api/agent/download/${metadata.sha256}`);
    assert.ok(await validateAgentReleaseMetadata(root, metadata));

    await writeFile(agentReleasePath(root, metadata.sha256), "tampered");
    assert.equal(await validateAgentReleaseMetadata(root, metadata), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("size mismatch never updates metadata", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-release-size-"));
  const source = path.join(root, "upload.tmp");
  let persisted = false;
  try {
    await writeFile(source, "short");
    await assert.rejects(publishAgentRelease({
      sourcePath: source,
      uploadsDir: root,
      originalName: "Cloudsave.exe",
      version: "2.0.0",
      expectedSize: 99,
      persistMetadata: async () => { persisted = true; },
    }), /size mismatch/);
    assert.equal(persisted, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
