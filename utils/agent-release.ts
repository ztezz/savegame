import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { lstat, mkdir, open, rename, rm, stat } from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

export const AGENT_FILENAME = "Cloudsave.exe";
export const AGENT_SETTINGS_KEY = "windowsAgent";
export const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export interface AgentReleaseMetadata {
  filename: typeof AGENT_FILENAME;
  originalName: string;
  version: string;
  size: number;
  sha256: string;
  releasePath: string;
  downloadUrl: string;
  updatedAt: string;
  available: true;
}

export function assertAgentVersion(version: string): string {
  if (!VERSION_PATTERN.test(version)) {
    throw Object.assign(new Error("Agent version must use x.y.z format"), { status: 400 });
  }
  return version;
}

export function assertSha256(value: string): string {
  if (!SHA256_PATTERN.test(value)) throw Object.assign(new Error("Invalid lowercase SHA-256 digest"), { status: 400 });
  return value;
}

export function agentReleasePath(uploadsDir: string, sha256: string): string {
  return path.join(uploadsDir, "agent", "releases", assertSha256(sha256), AGENT_FILENAME);
}

export async function hashAndSize(filePath: string): Promise<{ sha256: string; size: number }> {
  const digest = createHash("sha256");
  let size = 0;
  await new Promise<void>((resolve, reject) => {
    const input = fs.createReadStream(filePath);
    input.on("data", (chunk: Buffer) => {
      size += chunk.length;
      digest.update(chunk);
    });
    input.on("error", reject);
    input.on("end", resolve);
  });
  return { sha256: digest.digest("hex"), size };
}

async function verifyFile(filePath: string, sha256: string, size: number): Promise<boolean> {
  try {
    const fileStat = await lstat(filePath);
    if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.size !== size) return false;
    const actual = await hashAndSize(filePath);
    return actual.size === size && actual.sha256 === sha256;
  } catch {
    return false;
  }
}

export async function validateAgentReleaseMetadata(
  uploadsDir: string,
  value: unknown,
): Promise<{ metadata: AgentReleaseMetadata; filePath: string } | null> {
  if (!value || typeof value !== "object") return null;
  const metadata = value as AgentReleaseMetadata;
  if (
    metadata.filename !== AGENT_FILENAME ||
    typeof metadata.originalName !== "string" || !metadata.originalName || path.basename(metadata.originalName) !== metadata.originalName ||
    !VERSION_PATTERN.test(metadata.version) ||
    !SHA256_PATTERN.test(metadata.sha256) ||
    !Number.isSafeInteger(metadata.size) || metadata.size <= 0 ||
    metadata.releasePath !== `agent/releases/${metadata.sha256}/${AGENT_FILENAME}` ||
    metadata.downloadUrl !== `/api/agent/download/${metadata.sha256}` ||
    typeof metadata.updatedAt !== "string" || !Number.isFinite(Date.parse(metadata.updatedAt)) ||
    metadata.available !== true
  ) return null;

  const filePath = agentReleasePath(uploadsDir, metadata.sha256);
  return await verifyFile(filePath, metadata.sha256, metadata.size) ? { metadata, filePath } : null;
}

interface PublishAgentReleaseOptions {
  sourcePath: string;
  uploadsDir: string;
  originalName: string;
  version: string;
  expectedSize?: number;
  persistMetadata: (metadata: AgentReleaseMetadata) => Promise<void>;
}

let publicationTail: Promise<void> = Promise.resolve();

export async function publishAgentRelease(options: PublishAgentReleaseOptions): Promise<AgentReleaseMetadata> {
  const previous = publicationTail;
  let releaseLock!: () => void;
  publicationTail = new Promise<void>((resolve) => { releaseLock = resolve; });
  await previous;
  try {
    return await publishAgentReleaseLocked(options);
  } finally {
    releaseLock();
  }
}

async function publishAgentReleaseLocked(options: PublishAgentReleaseOptions): Promise<AgentReleaseMetadata> {
  const version = assertAgentVersion(options.version);
  const releasesDir = path.join(options.uploadsDir, "agent", "releases");
  const stagingDir = path.join(releasesDir, `.staging-${randomUUID()}`);
  const stagingFile = path.join(stagingDir, AGENT_FILENAME);
  await mkdir(releasesDir, { recursive: true });
  await mkdir(stagingDir, { recursive: false });

  let published = false;
  try {
    const digest = createHash("sha256");
    let size = 0;
    const output = await open(stagingFile, "wx");
    try {
      const input = fs.createReadStream(options.sourcePath);
      for await (const chunk of input) {
        const data = chunk as Buffer;
        size += data.length;
        digest.update(data);
        let offset = 0;
        while (offset < data.length) {
          const result = await output.write(data, offset, data.length - offset);
          if (result.bytesWritten <= 0) throw new Error("Could not completely write agent release");
          offset += result.bytesWritten;
        }
      }
      await output.sync();
    } finally {
      await output.close();
    }

    if (size <= 0 || (options.expectedSize !== undefined && size !== options.expectedSize)) {
      throw Object.assign(new Error(`Agent size mismatch: expected ${options.expectedSize}, received ${size}`), { status: 400 });
    }

    const sha256 = digest.digest("hex");
    const releaseDir = path.join(releasesDir, sha256);
    const releaseFile = path.join(releaseDir, AGENT_FILENAME);
    try {
      await rename(stagingDir, releaseDir);
      published = true;
    } catch (error: any) {
      if (!["EEXIST", "ENOTEMPTY", "EPERM"].includes(error?.code) || !await verifyFile(releaseFile, sha256, size)) throw error;
      await rm(stagingDir, { recursive: true, force: true });
      published = true;
    }

    const releaseStat = await stat(releaseFile);
    if (!releaseStat.isFile() || releaseStat.size !== size) throw new Error("Published agent release is inconsistent");

    const metadata: AgentReleaseMetadata = {
      filename: AGENT_FILENAME,
      originalName: path.basename(options.originalName),
      version,
      size,
      sha256,
      releasePath: `agent/releases/${sha256}/${AGENT_FILENAME}`,
      downloadUrl: `/api/agent/download/${sha256}`,
      updatedAt: new Date().toISOString(),
      available: true,
    };
    await options.persistMetadata(metadata);
    return metadata;
  } finally {
    if (!published) await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    await rm(options.sourcePath, { force: true }).catch(() => undefined);
  }
}
