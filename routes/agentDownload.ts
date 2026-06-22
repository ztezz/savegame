import { Router } from "express";
import * as path from "path";
import * as fs from "fs";
import { AGENT_VERSION, AGENT_EXE_PATH } from "../config/environment.js";

export const agentDownloadRouter = Router();

const EXE_NAME = "Cloudsave.exe";

function resolveExePath(): string | null {
  if (AGENT_EXE_PATH) {
    return fs.existsSync(AGENT_EXE_PATH) ? AGENT_EXE_PATH : null;
  }

  // Default: look in backend/file/ first, then legacy paths
  const candidates = [
    path.resolve(process.cwd(), "file", EXE_NAME),
    path.resolve(process.cwd(), "..", "windows-save-restore-agent", "dist", EXE_NAME),
    path.resolve(process.cwd(), "downloads", EXE_NAME),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

// GET /api/agent/info — version + whether exe is available
agentDownloadRouter.get("/api/agent/info", (_req, res) => {
  const exePath = resolveExePath();
  return res.json({
    version: AGENT_VERSION,
    available: exePath !== null,
    filename: EXE_NAME,
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
