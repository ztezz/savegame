import { Router } from "express";
import multer from "multer";
import * as path from "path";
import * as fs from "fs";
import { pool, isUsingDatabase } from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";
import { MAX_FILE_SIZE } from "../config/environment.js";
import { UPLOADS_DIR_PATH } from "../config/multer.js";

export const driveRouter = Router();

const DRIVE_DIR = path.join(UPLOADS_DIR_PATH, "drive");

if (!fs.existsSync(DRIVE_DIR)) {
  fs.mkdirSync(DRIVE_DIR, { recursive: true });
}

const driveUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DRIVE_DIR),
    filename: (_req, file, cb) => {
      const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `drive-${suffix}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE },
});

driveRouter.get("/api/drive/files", authenticateToken, async (req: any, res) => {
  if (!isUsingDatabase()) return res.json([]);

  try {
    const { rows } = await pool.query(
      `SELECT id, original_name, mime_type, file_size, note, created_at
       FROM drive_files
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to list drive files" });
  }
});

driveRouter.post("/api/drive/upload", authenticateToken, driveUpload.single("file"), async (req: any, res) => {
  const file = req.file;
  const note = String(req.body?.note || "").trim() || null;

  if (!file) return res.status(400).json({ error: "No file uploaded" });
  if (!isUsingDatabase()) return res.status(400).json({ error: "Drive requires database mode" });

  try {
    const { rows } = await pool.query(
      `INSERT INTO drive_files (user_id, original_name, stored_name, mime_type, file_size, note)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, original_name, mime_type, file_size, note, created_at`,
      [req.user.id, file.originalname, file.filename, file.mimetype || null, file.size, note]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    res.status(500).json({ error: err.message || "Drive upload failed" });
  }
});

driveRouter.get("/api/drive/download/:id", authenticateToken, async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid file id" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "File not found" });

  try {
    const { rows } = await pool.query(
      `SELECT original_name, stored_name
       FROM drive_files
       WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    const file = rows[0];
    if (!file) return res.status(404).json({ error: "File not found" });

    const filePath = path.join(DRIVE_DIR, file.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Physical file not found" });

    return res.download(filePath, file.original_name);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Drive download failed" });
  }
});

driveRouter.delete("/api/drive/files/:id", authenticateToken, async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid file id" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "File not found" });

  try {
    const { rows } = await pool.query(
      `DELETE FROM drive_files
       WHERE id = $1 AND user_id = $2
       RETURNING stored_name`,
      [id, req.user.id]
    );
    const file = rows[0];
    if (!file) return res.status(404).json({ error: "File not found" });

    const filePath = path.join(DRIVE_DIR, file.stored_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Drive delete failed" });
  }
});
