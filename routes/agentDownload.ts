import { Router } from "express";
import * as path from "path";
import * as fs from "fs";
import { AGENT_VERSION, AGENT_EXE_PATH } from "../config/environment.js";
import { pool, isUsingDatabase } from "../config/database.js";
import { UPLOADS_DIR_PATH } from "../config/multer.js";

export const agentDownloadRouter = Router();

const EXE_NAME = "Cloudsave.exe";
const WINDOWS_AGENT_SETTINGS_KEY = "windowsAgent";

function uploadedExePath() {
  return path.join(UPLOADS_DIR_PATH, "agent", EXE_NAME);
}

function resolveExePath(): string | null {
  const uploaded = uploadedExePath();
  if (fs.existsSync(uploaded)) return uploaded;

  if (AGENT_EXE_PATH) {
    return fs.existsSync(AGENT_EXE_PATH) ? AGENT_EXE_PATH : null;
  }

  return null;
}

// GET /api/agent/info — version + whether exe is available
agentDownloadRouter.get("/api/agent/info", async (_req, res) => {
  const exePath = resolveExePath();
  let metadata: any = null;

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query('SELECT value_json FROM system_settings WHERE key = $1', [WINDOWS_AGENT_SETTINGS_KEY]);
      metadata = rows[0]?.value_json || null;
    } catch (err) {
      console.warn('Could not load windows agent metadata:', err);
    }
  }

  return res.json({
    version: metadata?.version || AGENT_VERSION,
    available: exePath !== null,
    filename: metadata?.filename || EXE_NAME,
    size: exePath ? fs.statSync(exePath).size : 0,
    updatedAt: metadata?.updatedAt || null,
  });
});

// GET /api/agent/download — stream exe as a file download
agentDownloadRouter.get("/api/agent/download", (req, res) => {
  const exePath = resolveExePath();

  if (!exePath) {
    return res.status(404).json({
      error: "Agent binary not found on server. Please contact the administrator.",
    });
  }

  const stat = fs.statSync(exePath);
  res.setHeader("Content-Disposition", `attachment; filename="${EXE_NAME}"`);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", stat.size);

  const stream = fs.createReadStream(exePath);
  stream.on("error", (err) => {
    console.error("❌ Agent download stream error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Download failed" });
    }
  });
  stream.pipe(res);
});
