import { Router } from "express";
import * as path from "path";
import * as fs from "fs";
import { pool, isUsingDatabase } from "../config/database.js";
import { upload, UPLOADS_DIR_PATH } from "../config/multer.js";
import { authenticateToken, isAdmin } from "../middleware/auth.js";
import { streamFileDownload } from "../utils/download.js";

export const activationRouter = Router();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

// Download activation file
activationRouter.get("/api/activation/download/:id", authenticateToken, async (req: any, res) => {
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
      return streamFileDownload(res, filePath, record.original_name);
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  } else {
    res.status(404).json({ error: "File not found" });
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
  const { gameName, note } = req.body;

  if (!gameName || gameName.trim() === '') {
    return res.status(400).json({ error: "Game name is required" });
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

      await pool.query(
        'UPDATE activation_files SET game_name = $1, note = $2 WHERE id = $3',
        [gameName.trim(), note || '', id]
      );
      res.json({ message: "Updated successfully" });
    } catch (err) {
      console.error('❌ Update activation file error:', err);
      res.status(500).json({ error: "Database error" });
    }
  } else {
    res.status(404).json({ error: "File not found" });
  }
});
