import { Router } from "express";
import express from "express";
import * as path from "path";
import * as fs from "fs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { pool, isUsingDatabase } from "../config/database.js";
import { JWT_SECRET, PUBLIC_API_ORIGIN } from "../config/environment.js";
import { upload, UPLOADS_DIR_PATH } from "../config/multer.js";
import { authenticateToken, isAdmin } from "../middleware/auth.js";
import { streamFileDownload } from "../utils/download.js";
import { assertUploadComplete, getTempUploadDir, removeUploadSession, uploadSessions, writeUploadChunk } from "../utils/uploads.js";
import { UploadSession } from "../database/types.js";

export const activationRouter = Router();

const ACTIVATION_DOWNLOAD_TOKEN_TTL = "5m";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function createActivationDownloadUrl(fileId: number) {
  const token = jwt.sign({ purpose: "activation-download", fileId }, JWT_SECRET, { expiresIn: ACTIVATION_DOWNLOAD_TOKEN_TTL });
  return `${PUBLIC_API_ORIGIN}/api/activation/download-link/${encodeURIComponent(token)}`;
}

async function insertActivationFileWithRetry(values: any[]) {
  let lastErr: any;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await pool.query(
        'INSERT INTO activation_files (user_id, game_name, original_name, file_path, file_size, note) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        values
      );
    } catch (err: any) {
      lastErr = err;
      console.warn(`⚠️ Insert activation file failed (attempt ${attempt}/3):`, err?.message || err);
      if (attempt < 3) await sleep(attempt * 1500);
    }
  }
  throw lastErr;
}

activationRouter.post("/api/activation/upload/init", authenticateToken, isAdmin, express.json({ limit: "1mb" }), async (req: any, res) => {
  const fileName = String(req.body?.fileName || "").trim();
  const fileSize = Number(req.body?.fileSize || 0);
  if (!fileName || !Number.isFinite(fileSize) || fileSize <= 0) return res.status(400).json({ error: "Invalid file" });

  const sessionId = `activation_${req.user.id}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
  const chunkSize = 16 * 1024 * 1024;
  const tempFilePath = path.join(getTempUploadDir(), `${sessionId}.upload`);
  await fs.promises.writeFile(tempFilePath, Buffer.alloc(0));
  const session: UploadSession = {
    sessionId,
    userId: req.user.id,
    fileName,
    totalSize: fileSize,
    chunkSize,
    receivedChunks: new Set(),
    tempFilePath,
    createdAt: Date.now(),
    gameName: String(req.body?.gameName || "").trim(),
    note: String(req.body?.note || "").trim(),
  };
  uploadSessions.set(sessionId, session);
  res.json({ sessionId, chunkSize });
});

activationRouter.post("/api/activation/upload/chunk", authenticateToken, isAdmin, express.raw({ type: "application/octet-stream", limit: "20mb" }), async (req: any, res) => {
  const session = uploadSessions.get(String(req.query.sessionId || ""));
  if (!session || session.userId !== req.user.id) return res.status(404).json({ error: "Upload session not found" });
  try {
    await writeUploadChunk(session, Number(req.query.chunkIndex), Number(req.query.totalChunks), req.body as Buffer);
    res.json({ success: true, received: session.receivedChunks.size });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "Failed to save chunk" });
  }
});

activationRouter.post("/api/activation/upload/finalize", authenticateToken, isAdmin, express.json({ limit: "1mb" }), async (req: any, res) => {
  const sessionId = String(req.body?.sessionId || "");
  const session = uploadSessions.get(sessionId);
  if (!session || session.userId !== req.user.id) return res.status(404).json({ error: "Upload session not found" });
  const storedName = `activation_${Date.now()}_${crypto.randomBytes(6).toString("hex")}.bin`;
  const finalPath = path.join(UPLOADS_DIR_PATH, storedName);
  try {
    assertUploadComplete(session);
    await fs.promises.rename(session.tempFilePath, finalPath);
    const { rows } = await insertActivationFileWithRetry([req.user.id, session.gameName, session.fileName, storedName, session.totalSize, session.note || ""]);
    uploadSessions.delete(sessionId);
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
    removeUploadSession(sessionId);
    res.status(err.status || 500).json({ error: err.message || "Failed to finalize upload" });
  }
});

activationRouter.delete("/api/activation/upload/:sessionId", authenticateToken, isAdmin, (req: any, res) => {
  const session = uploadSessions.get(req.params.sessionId);
  if (!session || session.userId !== req.user.id) return res.status(404).json({ error: "Upload session not found" });
  removeUploadSession(req.params.sessionId);
  res.json({ success: true });
});

// Single file upload
activationRouter.post("/api/activation/upload", authenticateToken, isAdmin, upload.single("activationfile"), async (req: any, res) => {
  const { gameName, note } = req.body;
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  if (isUsingDatabase()) {
    try {
      const { rows } = await insertActivationFileWithRetry([req.user.id, gameName, file.originalname, file.filename, file.size, note || '']);
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error('❌ Upload activation file error:', err);
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      res.status(500).json({ error: "Upload failed: " + (err instanceof Error ? err.message : String(err)) });
    }
  } else {
    res.status(201).json({ success: true, message: "Upload successful" });
  }
});

// List activation files
activationRouter.get("/api/activation/list", authenticateToken, async (req: any, res) => {
  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM activation_files ORDER BY created_at DESC'
      );
      res.json(rows.map(r => ({
        id: r.id,
        gameName: r.game_name,
        originalName: r.original_name,
        fileSize: Number(r.file_size),
        note: r.note,
        createdAt: r.created_at
      })));
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  } else {
    res.json([]);
  }
});

// Create a short-lived browser download link.
activationRouter.post("/api/activation/download/:id/link", authenticateToken, async (req: any, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid activation file ID" });

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query('SELECT id FROM activation_files WHERE id = $1', [id]);
      if (!rows[0]) return res.status(404).json({ error: "File not found" });
      return res.json({ downloadUrl: createActivationDownloadUrl(id), expiresInSeconds: 300 });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

activationRouter.get("/api/activation/download-link/:token", async (req, res) => {
  let fileId: number;
  try {
    const payload = jwt.verify(req.params.token, JWT_SECRET) as jwt.JwtPayload;
    if (payload.purpose !== "activation-download" || !Number.isInteger(payload.fileId)) throw new Error("Invalid download token");
    fileId = payload.fileId;
  } catch {
    return res.status(401).json({ error: "Download link is invalid or expired" });
  }

  if (!isUsingDatabase()) return res.status(404).json({ error: "File not found" });

  try {
    const { rows } = await pool.query('SELECT file_path, original_name FROM activation_files WHERE id = $1', [fileId]);
    const record = rows[0];
    if (!record) return res.status(404).json({ error: "File not found" });
    return streamFileDownload(res, path.join(UPLOADS_DIR_PATH, record.file_path), record.original_name);
  } catch (err) {
    return res.status(500).json({ error: "Database error" });
  }
});

// Delete activation file
activationRouter.delete("/api/activation/:id", authenticateToken, isAdmin, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM activation_files WHERE id = $1',
        [id]
      );
      const record = rows[0];
      if (!record) return res.status(404).json({ error: "File not found" });

      const filePath = path.join(UPLOADS_DIR_PATH, record.file_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      await pool.query('DELETE FROM activation_files WHERE id = $1', [id]);
      res.json({ message: "Deleted" });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

// Update activation file
activationRouter.put("/api/activation/:id", authenticateToken, isAdmin, async (req: any, res) => {
  const id = parseInt(req.params.id);
  const gameName = String(req.body?.gameName || '').trim();
  const originalName = String(req.body?.originalName || '').trim();
  const note = String(req.body?.note || '').trim();

  if (!gameName) {
    return res.status(400).json({ error: "Game name is required" });
  }
  if (!originalName) {
    return res.status(400).json({ error: "File name is required" });
  }
  if (originalName.length > 255 || /[\\/\u0000-\u001f]/.test(originalName)) {
    return res.status(400).json({ error: "Invalid file name" });
  }

  if (isUsingDatabase()) {
    try {
      const checkQuery = await pool.query(
        'SELECT * FROM activation_files WHERE id = $1',
        [id]
      );
      if (checkQuery.rows.length === 0) {
        return res.status(404).json({ error: "File not found" });
      }

      const { rows } = await pool.query(
        `UPDATE activation_files
         SET game_name = $1, original_name = $2, note = $3
         WHERE id = $4
         RETURNING id, game_name, original_name, file_size, note, created_at`,
        [gameName, originalName, note, id]
      );
      const record = rows[0];
      res.json({
        message: "Updated successfully",
        file: {
          id: record.id,
          gameName: record.game_name,
          originalName: record.original_name,
          fileSize: Number(record.file_size),
          note: record.note,
          createdAt: record.created_at,
        },
      });
    } catch (err) {
      console.error('❌ Update activation file error:', err);
      res.status(500).json({ error: "Database error" });
    }
  } else {
    res.status(404).json({ error: "File not found" });
  }
});
