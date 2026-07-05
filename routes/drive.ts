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
  const folderId = req.query.folderId ? Number(req.query.folderId) : null;

  try {
    if (folderId && !Number.isInteger(folderId)) return res.status(400).json({ error: "Invalid folder id" });

    if (folderId) {
      const folderCheck = await pool.query('SELECT id FROM drive_folders WHERE id = $1 AND user_id = $2', [folderId, req.user.id]);
      if (folderCheck.rows.length === 0) return res.status(404).json({ error: "Folder not found" });
    }

    const folders = await pool.query(
      `SELECT id, name, parent_id, created_at
       FROM drive_folders
       WHERE user_id = $1 AND ${folderId ? 'parent_id = $2' : 'parent_id IS NULL'}
       ORDER BY name ASC`,
      folderId ? [req.user.id, folderId] : [req.user.id]
    );

    const { rows } = await pool.query(
      `SELECT id, original_name, mime_type, file_size, note, created_at
       FROM drive_files
       WHERE user_id = $1 AND ${folderId ? 'folder_id = $2' : 'folder_id IS NULL'}
       ORDER BY created_at DESC`,
      folderId ? [req.user.id, folderId] : [req.user.id]
    );
    res.json({ folders: folders.rows, files: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to list drive files" });
  }
});

driveRouter.get("/api/drive/folders/:id/breadcrumb", authenticateToken, async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid folder id" });
  if (!isUsingDatabase()) return res.json([]);

  try {
    const trail: any[] = [];
    let currentId: number | null = id;
    for (let i = 0; i < 20 && currentId; i++) {
      const { rows } = await pool.query(
        'SELECT id, name, parent_id FROM drive_folders WHERE id = $1 AND user_id = $2',
        [currentId, req.user.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Folder not found" });
      trail.unshift(rows[0]);
      currentId = rows[0].parent_id;
    }
    res.json(trail);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load breadcrumb" });
  }
});

driveRouter.post("/api/drive/folders", authenticateToken, async (req: any, res) => {
  const name = String(req.body?.name || '').trim();
  const parentId = req.body?.parentId ? Number(req.body.parentId) : null;
  if (!name) return res.status(400).json({ error: "Folder name is required" });
  if (name.includes('/') || name.includes('\\')) return res.status(400).json({ error: "Folder name cannot contain slashes" });
  if (!isUsingDatabase()) return res.status(400).json({ error: "Drive requires database mode" });

  try {
    if (parentId) {
      const parent = await pool.query('SELECT id FROM drive_folders WHERE id = $1 AND user_id = $2', [parentId, req.user.id]);
      if (parent.rows.length === 0) return res.status(404).json({ error: "Parent folder not found" });
    }
    const { rows } = await pool.query(
      `INSERT INTO drive_folders (user_id, parent_id, name)
       VALUES ($1, $2, $3)
       RETURNING id, name, parent_id, created_at`,
      [req.user.id, parentId, name]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(400).json({ error: "Folder already exists" });
    res.status(500).json({ error: err.message || "Failed to create folder" });
  }
});

driveRouter.post("/api/drive/upload", authenticateToken, driveUpload.single("file"), async (req: any, res) => {
  const file = req.file;
  const note = String(req.body?.note || "").trim() || null;
  const folderId = req.body?.folderId ? Number(req.body.folderId) : null;

  if (!file) return res.status(400).json({ error: "No file uploaded" });
  if (!isUsingDatabase()) return res.status(400).json({ error: "Drive requires database mode" });

  try {
    if (folderId) {
      const folder = await pool.query('SELECT id FROM drive_folders WHERE id = $1 AND user_id = $2', [folderId, req.user.id]);
      if (folder.rows.length === 0) return res.status(404).json({ error: "Folder not found" });
    }
    const { rows } = await pool.query(
      `INSERT INTO drive_files (user_id, folder_id, original_name, stored_name, mime_type, file_size, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, original_name, mime_type, file_size, note, created_at`,
      [req.user.id, folderId, file.originalname, file.filename, file.mimetype || null, file.size, note]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    res.status(500).json({ error: err.message || "Drive upload failed" });
  }
});

driveRouter.delete("/api/drive/folders/:id", authenticateToken, async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid folder id" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "Folder not found" });

  try {
    const { rows } = await pool.query(
      `WITH RECURSIVE folder_tree AS (
         SELECT id FROM drive_folders WHERE id = $1 AND user_id = $2
         UNION ALL
         SELECT child.id FROM drive_folders child JOIN folder_tree ft ON child.parent_id = ft.id
       )
       SELECT df.stored_name
       FROM drive_files df
       JOIN folder_tree ft ON df.folder_id = ft.id
       WHERE df.user_id = $2`,
      [id, req.user.id]
    );

    const deleted = await pool.query('DELETE FROM drive_folders WHERE id = $1 AND user_id = $2 RETURNING id', [id, req.user.id]);
    if (deleted.rows.length === 0) return res.status(404).json({ error: "Folder not found" });

    for (const file of rows) {
      const filePath = path.join(DRIVE_DIR, file.stored_name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    res.json({ success: true, deletedFiles: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Drive folder delete failed" });
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
