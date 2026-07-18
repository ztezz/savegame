import { Router } from "express";
import * as fs from "node:fs";
import { AGENT_EXE_PATH, AGENT_VERSION } from "../config/environment.js";
import { pool, isUsingDatabase } from "../config/database.js";
import { UPLOADS_DIR_PATH } from "../config/multer.js";
import {
  AGENT_FILENAME,
  AGENT_SETTINGS_KEY,
  AgentReleaseMetadata,
  SHA256_PATTERN,
  VERSION_PATTERN,
  agentReleasePath,
  hashAndSize,
  validateAgentReleaseMetadata,
} from "../utils/agent-release.js";
import { streamFileDownload } from "../utils/download.js";

export const agentDownloadRouter = Router();

interface ResolvedAgent {
  metadata: AgentReleaseMetadata;
  filePath: string;
  fallback: boolean;
}

async function configuredFallback(): Promise<ResolvedAgent | null> {
  if (!AGENT_EXE_PATH || !VERSION_PATTERN.test(AGENT_VERSION)) return null;
  try {
    const actual = await hashAndSize(AGENT_EXE_PATH);
    if (actual.size <= 0) return null;
    return {
      filePath: AGENT_EXE_PATH,
      fallback: true,
      metadata: {
        filename: AGENT_FILENAME,
        originalName: AGENT_FILENAME,
        version: AGENT_VERSION,
        size: actual.size,
        sha256: actual.sha256,
        releasePath: AGENT_EXE_PATH,
        downloadUrl: "/api/agent/download",
        updatedAt: (await fs.promises.stat(AGENT_EXE_PATH)).mtime.toISOString(),
        available: true,
      },
    };
  } catch {
    return null;
  }
}

async function currentAgent(): Promise<ResolvedAgent | null> {
  if (!isUsingDatabase()) return configuredFallback();
  try {
    const { rows } = await pool.query("SELECT value_json FROM system_settings WHERE key = $1", [AGENT_SETTINGS_KEY]);
    const verified = await validateAgentReleaseMetadata(UPLOADS_DIR_PATH, rows[0]?.value_json);
    return verified ? { ...verified, fallback: false } : null;
  } catch (error) {
    console.warn("Could not load windows agent metadata; using configured fallback:", error);
    return configuredFallback();
  }
}

function serveAgent(req: any, res: any, release: ResolvedAgent, immutable: boolean) {
  const etag = `"sha256-${release.metadata.sha256}"`;
  res.setHeader("ETag", etag);
  res.setHeader("Digest", `sha-256=${Buffer.from(release.metadata.sha256, "hex").toString("base64")}`);
  res.setHeader("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "private, no-cache");
  if (req.headers["if-none-match"] === etag) return res.status(304).end();
  return streamFileDownload(res, release.filePath, AGENT_FILENAME, {
    etag,
    digest: release.metadata.sha256,
    cacheControl: immutable ? "public, max-age=31536000, immutable" : "private, no-cache",
  });
}

// Metadata is useful only when its immutable artifact still matches byte-for-byte.
agentDownloadRouter.get("/api/agent/info", async (_req, res) => {
  const release = await currentAgent();
  if (!release) {
    return res.json({ version: AGENT_VERSION, available: false, filename: AGENT_FILENAME, size: 0, sha256: null, downloadUrl: null, updatedAt: null });
  }
  const { metadata } = release;
  return res.json({
    version: metadata.version,
    available: true,
    filename: metadata.filename,
    size: metadata.size,
    sha256: metadata.sha256,
    releasePath: metadata.releasePath,
    downloadUrl: metadata.downloadUrl,
    updatedAt: metadata.updatedAt,
  });
});

agentDownloadRouter.get("/api/agent/download/:sha256", async (req, res) => {
  const sha256 = String(req.params.sha256 || "");
  if (!SHA256_PATTERN.test(sha256)) return res.status(400).json({ error: "Invalid lowercase SHA-256 digest" });

  const filePath = agentReleasePath(UPLOADS_DIR_PATH, sha256);
  const releaseStat = await fs.promises.lstat(filePath).catch(() => null);
  if (!releaseStat?.isFile() || releaseStat.isSymbolicLink()) return res.status(404).json({ error: "Agent release not found" });
  const actual = await hashAndSize(filePath).catch(() => null);
  if (!actual || actual.sha256 !== sha256 || actual.size <= 0) return res.status(404).json({ error: "Agent release not found" });

  return serveAgent(req, res, {
    filePath,
    fallback: false,
    metadata: {
      filename: AGENT_FILENAME,
      originalName: AGENT_FILENAME,
      version: "0.0.0",
      size: actual.size,
      sha256,
      releasePath: `agent/releases/${sha256}/${AGENT_FILENAME}`,
      downloadUrl: `/api/agent/download/${sha256}`,
      updatedAt: "",
      available: true,
    },
  }, true);
});

// Compatibility endpoint follows only the current verified release metadata.
agentDownloadRouter.get("/api/agent/download", async (req, res) => {
  const release = await currentAgent();
  if (!release) return res.status(404).json({ error: "Agent binary not found or failed integrity verification" });
  return serveAgent(req, res, release, false);
});
