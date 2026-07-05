import { Router } from "express";
import multer from "multer";
import * as path from "path";
import * as fs from "fs";
import crypto from "crypto";
import { pool, isUsingDatabase } from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";
import { DRIVE_QUOTA_BYTES, MAX_FILE_SIZE } from "../config/environment.js";
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

const parseId = (value: unknown) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const cleanName = (value: unknown, maxLength: number) => {
  const name = String(value || "").trim();
  if (!name) return null;
  if (name.includes("/") || name.includes("\\")) return null;
  return name.slice(0, maxLength);
};

const assertFolder = async (folderId: number | null, userId: number, allowDeleted = false) => {
  if (!folderId) return;
  const { rows } = await pool.query(
    `SELECT id FROM drive_folders WHERE id = $1 AND user_id = $2 ${allowDeleted ? "" : "AND deleted_at IS NULL"}`,
    [folderId, userId]
  );
  if (rows.length === 0) throw new Error("Folder not found");
};

const assertMoveTarget = async (folderId: number, parentId: number | null, userId: number) => {
  if (!parentId) return;
  if (folderId === parentId) throw new Error("Cannot move a folder into itself");
  await assertFolder(parentId, userId);
  const { rows } = await pool.query(
    `WITH RECURSIVE folder_tree AS (
       SELECT id FROM drive_folders WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       UNION ALL
       SELECT child.id FROM drive_folders child JOIN folder_tree ft ON child.parent_id = ft.id
       WHERE child.user_id = $2 AND child.deleted_at IS NULL
     )
     SELECT id FROM folder_tree WHERE id = $3`,
    [folderId, userId, parentId]
  );
  if (rows.length > 0) throw new Error("Cannot move a folder into its own subfolder");
};

const unlinkStoredFiles = (rows: Array<{ stored_name: string }>) => {
  for (const file of rows) {
    const filePath = path.join(DRIVE_DIR, file.stored_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
};

const isPreviewableText = (mimeType: string | null, originalName: string) => {
  const ext = path.extname(originalName).toLowerCase();
  return Boolean(
    mimeType?.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    [".txt", ".log", ".json", ".xml", ".ini", ".cfg", ".csv", ".md", ".sav"].includes(ext)
  );
};

const buildFileMeta = (file: any) => ({
  id: file.id,
  original_name: file.original_name,
  mime_type: file.mime_type,
  file_size: Number(file.file_size || 0),
  note: file.note,
  created_at: file.created_at,
});

const getDriveUsage = async (userId: number) => {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(file_size) FILTER (WHERE deleted_at IS NULL), 0)::bigint AS active_bytes,
       COALESCE(SUM(file_size) FILTER (WHERE deleted_at IS NOT NULL), 0)::bigint AS trash_bytes,
       COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS active_files,
       COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS trash_files
     FROM drive_files
     WHERE user_id = $1`,
    [userId]
  );
  const row = rows[0] || {};
  const activeBytes = Number(row.active_bytes || 0);
  const trashBytes = Number(row.trash_bytes || 0);
  return {
    activeBytes,
    trashBytes,
    totalBytes: activeBytes + trashBytes,
    activeFiles: Number(row.active_files || 0),
    trashFiles: Number(row.trash_files || 0),
    quotaBytes: DRIVE_QUOTA_BYTES,
  };
};

driveRouter.get("/api/drive/usage", authenticateToken, async (req: any, res) => {
  if (!isUsingDatabase()) return res.json({ activeBytes: 0, trashBytes: 0, totalBytes: 0, activeFiles: 0, trashFiles: 0, quotaBytes: DRIVE_QUOTA_BYTES });

  try {
    res.json(await getDriveUsage(req.user.id));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to read drive usage" });
  }
});

driveRouter.get("/api/drive/files", authenticateToken, async (req: any, res) => {
  if (!isUsingDatabase()) return res.json({ folders: [], files: [] });
  const folderId = req.query.folderId ? parseId(req.query.folderId) : null;
  const trash = req.query.trash === "1" || req.query.trash === "true";
  const search = String(req.query.search || "").trim();
  const likeSearch = `%${search}%`;

  try {
    if (req.query.folderId && !folderId) return res.status(400).json({ error: "Invalid folder id" });

    if (trash) {
      const folders = await pool.query(
        `SELECT id, name, parent_id, created_at, deleted_at
         FROM drive_folders
         WHERE user_id = $1 AND deleted_at IS NOT NULL AND ($2 = '' OR name ILIKE $3)
         ORDER BY deleted_at DESC`,
        [req.user.id, search, likeSearch]
      );
      const files = await pool.query(
        `SELECT id, original_name, mime_type, file_size, note, created_at, deleted_at
         FROM drive_files
         WHERE user_id = $1 AND deleted_at IS NOT NULL AND ($2 = '' OR original_name ILIKE $3 OR COALESCE(note, '') ILIKE $3)
         ORDER BY deleted_at DESC`,
        [req.user.id, search, likeSearch]
      );
      return res.json({ folders: folders.rows, files: files.rows });
    }

    if (!search) await assertFolder(folderId, req.user.id);

    const folders = await pool.query(
      `SELECT id, name, parent_id, created_at, deleted_at
       FROM drive_folders
       WHERE user_id = $1 AND deleted_at IS NULL
         AND ($2 = '' OR name ILIKE $3)
         AND ($2 != '' OR ${folderId ? "parent_id = $4" : "parent_id IS NULL"})
       ORDER BY name ASC`,
      folderId ? [req.user.id, search, likeSearch, folderId] : [req.user.id, search, likeSearch]
    );

    const { rows } = await pool.query(
      `SELECT id, original_name, mime_type, file_size, note, created_at, deleted_at
       FROM drive_files
       WHERE user_id = $1 AND deleted_at IS NULL
         AND ($2 = '' OR original_name ILIKE $3 OR COALESCE(note, '') ILIKE $3)
         AND ($2 != '' OR ${folderId ? "folder_id = $4" : "folder_id IS NULL"})
       ORDER BY created_at DESC`,
      folderId ? [req.user.id, search, likeSearch, folderId] : [req.user.id, search, likeSearch]
    );
    res.json({ folders: folders.rows, files: rows });
  } catch (err: any) {
    const status = err.message === "Folder not found" ? 404 : 500;
    res.status(status).json({ error: err.message || "Failed to list drive files" });
  }
});

driveRouter.get("/api/drive/folders/:id/breadcrumb", authenticateToken, async (req: any, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid folder id" });
  if (!isUsingDatabase()) return res.json([]);

  try {
    const trail: any[] = [];
    let currentId: number | null = id;
    for (let i = 0; i < 20 && currentId; i++) {
      const { rows } = await pool.query(
        "SELECT id, name, parent_id FROM drive_folders WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
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
  const name = cleanName(req.body?.name, 120);
  const parentId = req.body?.parentId ? parseId(req.body.parentId) : null;
  if (!name) return res.status(400).json({ error: "Folder name is required and cannot contain slashes" });
  if (req.body?.parentId && !parentId) return res.status(400).json({ error: "Invalid parent folder id" });
  if (!isUsingDatabase()) return res.status(400).json({ error: "Drive requires database mode" });

  try {
    await assertFolder(parentId, req.user.id);
    const { rows } = await pool.query(
      `INSERT INTO drive_folders (user_id, parent_id, name)
       VALUES ($1, $2, $3)
       RETURNING id, name, parent_id, created_at, deleted_at`,
      [req.user.id, parentId, name]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === "23505") return res.status(400).json({ error: "Folder already exists" });
    const status = err.message === "Folder not found" ? 404 : 500;
    res.status(status).json({ error: err.message || "Failed to create folder" });
  }
});

driveRouter.post("/api/drive/upload", authenticateToken, driveUpload.fields([{ name: "files", maxCount: 50 }, { name: "file", maxCount: 1 }]), async (req: any, res) => {
  const fieldFiles = req.files as Record<string, Express.Multer.File[]> | undefined;
  const files = [...(fieldFiles?.files || []), ...(fieldFiles?.file || [])];
  const note = String(req.body?.note || "").trim() || null;
  const folderId = req.body?.folderId ? parseId(req.body.folderId) : null;

  if (files.length === 0) return res.status(400).json({ error: "No file uploaded" });
  if (req.body?.folderId && !folderId) return res.status(400).json({ error: "Invalid folder id" });
  if (!isUsingDatabase()) return res.status(400).json({ error: "Drive requires database mode" });

  try {
    await assertFolder(folderId, req.user.id);
    const usage = await getDriveUsage(req.user.id);
    const uploadBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (usage.totalBytes + uploadBytes > usage.quotaBytes) {
      for (const file of files) if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(413).json({
        error: "Drive quota exceeded",
        usage,
        uploadBytes,
      });
    }

    const inserted = [];
    for (const file of files) {
      const { rows } = await pool.query(
        `INSERT INTO drive_files (user_id, folder_id, original_name, stored_name, mime_type, file_size, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, original_name, mime_type, file_size, note, created_at, deleted_at`,
        [req.user.id, folderId, file.originalname, file.filename, file.mimetype || null, file.size, note]
      );
      inserted.push(rows[0]);
    }
    res.status(201).json(files.length === 1 ? inserted[0] : inserted);
  } catch (err: any) {
    for (const file of files) if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    const status = err.message === "Folder not found" ? 404 : 500;
    res.status(status).json({ error: err.message || "Drive upload failed" });
  }
});

driveRouter.patch("/api/drive/files/:id", authenticateToken, async (req: any, res) => {
  const id = parseId(req.params.id);
  const name = cleanName(req.body?.name, 255);
  if (!id) return res.status(400).json({ error: "Invalid file id" });
  if (!name) return res.status(400).json({ error: "File name is required and cannot contain slashes" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "File not found" });

  try {
    const { rows } = await pool.query(
      `UPDATE drive_files SET original_name = $1
       WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
       RETURNING id, original_name, mime_type, file_size, note, created_at, deleted_at`,
      [name, id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "File not found" });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Drive rename failed" });
  }
});

driveRouter.patch("/api/drive/folders/:id", authenticateToken, async (req: any, res) => {
  const id = parseId(req.params.id);
  const name = cleanName(req.body?.name, 120);
  if (!id) return res.status(400).json({ error: "Invalid folder id" });
  if (!name) return res.status(400).json({ error: "Folder name is required and cannot contain slashes" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "Folder not found" });

  try {
    const { rows } = await pool.query(
      `UPDATE drive_folders SET name = $1
       WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
       RETURNING id, name, parent_id, created_at, deleted_at`,
      [name, id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Folder not found" });
    res.json(rows[0]);
  } catch (err: any) {
    if (err.code === "23505") return res.status(400).json({ error: "Folder already exists" });
    res.status(500).json({ error: err.message || "Drive rename failed" });
  }
});

driveRouter.patch("/api/drive/files/:id/move", authenticateToken, async (req: any, res) => {
  const id = parseId(req.params.id);
  const folderId = req.body?.folderId ? parseId(req.body.folderId) : null;
  if (!id) return res.status(400).json({ error: "Invalid file id" });
  if (req.body?.folderId && !folderId) return res.status(400).json({ error: "Invalid folder id" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "File not found" });

  try {
    await assertFolder(folderId, req.user.id);
    const { rows } = await pool.query(
      `UPDATE drive_files SET folder_id = $1
       WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
       RETURNING id, original_name, mime_type, file_size, note, created_at, deleted_at`,
      [folderId, id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "File not found" });
    res.json(rows[0]);
  } catch (err: any) {
    const status = err.message === "Folder not found" ? 404 : 400;
    res.status(status).json({ error: err.message || "Drive move failed" });
  }
});

driveRouter.patch("/api/drive/folders/:id/move", authenticateToken, async (req: any, res) => {
  const id = parseId(req.params.id);
  const parentId = req.body?.parentId ? parseId(req.body.parentId) : null;
  if (!id) return res.status(400).json({ error: "Invalid folder id" });
  if (req.body?.parentId && !parentId) return res.status(400).json({ error: "Invalid parent folder id" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "Folder not found" });

  try {
    await assertFolder(id, req.user.id);
    await assertMoveTarget(id, parentId, req.user.id);
    const { rows } = await pool.query(
      `UPDATE drive_folders SET parent_id = $1
       WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
       RETURNING id, name, parent_id, created_at, deleted_at`,
      [parentId, id, req.user.id]
    );
    res.json(rows[0]);
  } catch (err: any) {
    const status = err.message === "Folder not found" ? 404 : 400;
    res.status(status).json({ error: err.message || "Drive move failed" });
  }
});

driveRouter.get("/api/drive/download/:id", authenticateToken, async (req: any, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid file id" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "File not found" });

  try {
    const { rows } = await pool.query(
      `SELECT original_name, stored_name
       FROM drive_files
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
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

driveRouter.get("/api/drive/files/:id/raw", authenticateToken, async (req: any, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid file id" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "File not found" });

  try {
    const { rows } = await pool.query(
      `SELECT original_name, stored_name, mime_type
       FROM drive_files
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, req.user.id]
    );
    const file = rows[0];
    if (!file) return res.status(404).json({ error: "File not found" });

    const filePath = path.join(DRIVE_DIR, file.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Physical file not found" });

    res.setHeader("Content-Type", file.mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.original_name)}"`);
    return res.sendFile(filePath);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Drive preview failed" });
  }
});

driveRouter.get("/api/drive/files/:id/preview", authenticateToken, async (req: any, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid file id" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "File not found" });

  try {
    const { rows } = await pool.query(
      `SELECT id, original_name, stored_name, mime_type, file_size, note, created_at
       FROM drive_files
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, req.user.id]
    );
    const file = rows[0];
    if (!file) return res.status(404).json({ error: "File not found" });

    const filePath = path.join(DRIVE_DIR, file.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Physical file not found" });

    const meta = buildFileMeta(file);
    if (file.mime_type?.startsWith("image/")) return res.json({ kind: "image", file: meta });
    if (file.mime_type === "application/pdf") return res.json({ kind: "pdf", file: meta });
    if (isPreviewableText(file.mime_type, file.original_name)) {
      const content = fs.readFileSync(filePath, "utf8").slice(0, 200000);
      return res.json({ kind: "text", file: meta, content, truncated: Number(file.file_size) > 200000 });
    }
    return res.json({ kind: "unsupported", file: meta });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Drive preview failed" });
  }
});

driveRouter.post("/api/drive/files/:id/share", authenticateToken, async (req: any, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid file id" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "File not found" });

  try {
    const file = await pool.query("SELECT id FROM drive_files WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL", [id, req.user.id]);
    if (!file.rows[0]) return res.status(404).json({ error: "File not found" });

    const existing = await pool.query(
      "SELECT token FROM drive_shares WHERE user_id = $1 AND file_id = $2 AND disabled_at IS NULL",
      [req.user.id, id]
    );
    if (existing.rows[0]) return res.json({ token: existing.rows[0].token });

    const token = crypto.randomBytes(24).toString("hex");
    const { rows } = await pool.query(
      `INSERT INTO drive_shares (user_id, file_id, token, disabled_at)
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT (user_id, file_id)
       DO UPDATE SET token = EXCLUDED.token, disabled_at = NULL, created_at = CURRENT_TIMESTAMP
       RETURNING token`,
      [req.user.id, id, token]
    );
    res.status(201).json({ token: rows[0].token });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Drive share failed" });
  }
});

driveRouter.delete("/api/drive/files/:id/share", authenticateToken, async (req: any, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid file id" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "File not found" });

  try {
    await pool.query(
      "UPDATE drive_shares SET disabled_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND file_id = $2 AND disabled_at IS NULL",
      [req.user.id, id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Drive unshare failed" });
  }
});

driveRouter.get("/api/drive/share/:token", async (req, res) => {
  if (!isUsingDatabase()) return res.status(404).json({ error: "Share not found" });

  try {
    const { rows } = await pool.query(
      `SELECT df.id, df.original_name, df.mime_type, df.file_size, df.note, df.created_at
       FROM drive_shares ds
       JOIN drive_files df ON df.id = ds.file_id
       WHERE ds.token = $1 AND ds.disabled_at IS NULL AND df.deleted_at IS NULL
         AND (ds.expires_at IS NULL OR ds.expires_at > CURRENT_TIMESTAMP)`,
      [req.params.token]
    );
    if (!rows[0]) return res.status(404).json({ error: "Share not found" });
    res.json({ file: buildFileMeta(rows[0]) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Drive share failed" });
  }
});

driveRouter.get("/api/drive/share/:token/download", async (req, res) => {
  if (!isUsingDatabase()) return res.status(404).json({ error: "Share not found" });

  try {
    const { rows } = await pool.query(
      `SELECT df.original_name, df.stored_name
       FROM drive_shares ds
       JOIN drive_files df ON df.id = ds.file_id
       WHERE ds.token = $1 AND ds.disabled_at IS NULL AND df.deleted_at IS NULL
         AND (ds.expires_at IS NULL OR ds.expires_at > CURRENT_TIMESTAMP)`,
      [req.params.token]
    );
    const file = rows[0];
    if (!file) return res.status(404).json({ error: "Share not found" });

    const filePath = path.join(DRIVE_DIR, file.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Physical file not found" });
    return res.download(filePath, file.original_name);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Drive share download failed" });
  }
});

driveRouter.delete("/api/drive/files/:id", authenticateToken, async (req: any, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid file id" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "File not found" });

  try {
    const { rows } = await pool.query(
      `UPDATE drive_files SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "File not found" });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Drive delete failed" });
  }
});

driveRouter.delete("/api/drive/folders/:id", authenticateToken, async (req: any, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid folder id" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "Folder not found" });

  try {
    const folder = await pool.query("SELECT id FROM drive_folders WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL", [id, req.user.id]);
    if (!folder.rows[0]) return res.status(404).json({ error: "Folder not found" });

    await pool.query(
      `WITH RECURSIVE folder_tree AS (
         SELECT id FROM drive_folders WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
         UNION ALL
         SELECT child.id FROM drive_folders child JOIN folder_tree ft ON child.parent_id = ft.id
         WHERE child.user_id = $2 AND child.deleted_at IS NULL
       ), updated_folders AS (
         UPDATE drive_folders SET deleted_at = CURRENT_TIMESTAMP
         WHERE id IN (SELECT id FROM folder_tree)
         RETURNING id
       )
       UPDATE drive_files SET deleted_at = CURRENT_TIMESTAMP
       WHERE user_id = $2 AND deleted_at IS NULL AND folder_id IN (SELECT id FROM folder_tree)`,
      [id, req.user.id]
    );

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Drive folder delete failed" });
  }
});

driveRouter.post("/api/drive/files/:id/restore", authenticateToken, async (req: any, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid file id" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "File not found" });

  try {
    const { rows } = await pool.query(
      `UPDATE drive_files SET deleted_at = NULL
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL
       RETURNING id`,
      [id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "File not found" });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Drive restore failed" });
  }
});

driveRouter.post("/api/drive/folders/:id/restore", authenticateToken, async (req: any, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid folder id" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "Folder not found" });

  try {
    const folder = await pool.query("SELECT id FROM drive_folders WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL", [id, req.user.id]);
    if (!folder.rows[0]) return res.status(404).json({ error: "Folder not found" });
    await pool.query(
      `WITH RECURSIVE folder_tree AS (
         SELECT id FROM drive_folders WHERE id = $1 AND user_id = $2
         UNION ALL
         SELECT child.id FROM drive_folders child JOIN folder_tree ft ON child.parent_id = ft.id
         WHERE child.user_id = $2
       ), updated_folders AS (
         UPDATE drive_folders SET deleted_at = NULL
         WHERE id IN (SELECT id FROM folder_tree)
         RETURNING id
       )
       UPDATE drive_files SET deleted_at = NULL
       WHERE user_id = $2 AND folder_id IN (SELECT id FROM folder_tree)`,
      [id, req.user.id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Drive restore failed" });
  }
});

driveRouter.delete("/api/drive/files/:id/permanent", authenticateToken, async (req: any, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid file id" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "File not found" });

  try {
    const { rows } = await pool.query(
      `DELETE FROM drive_files
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL
       RETURNING stored_name`,
      [id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "File not found" });
    unlinkStoredFiles(rows);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Drive permanent delete failed" });
  }
});

driveRouter.delete("/api/drive/folders/:id/permanent", authenticateToken, async (req: any, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid folder id" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "Folder not found" });

  try {
    const { rows } = await pool.query(
      `WITH RECURSIVE folder_tree AS (
         SELECT id FROM drive_folders WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL
         UNION ALL
         SELECT child.id FROM drive_folders child JOIN folder_tree ft ON child.parent_id = ft.id
       ), deleted_files AS (
         DELETE FROM drive_files
         WHERE user_id = $2 AND folder_id IN (SELECT id FROM folder_tree)
         RETURNING stored_name
       ), deleted_folders AS (
         DELETE FROM drive_folders WHERE id IN (SELECT id FROM folder_tree) RETURNING id
       )
       SELECT stored_name FROM deleted_files`,
      [id, req.user.id]
    );
    unlinkStoredFiles(rows);
    res.json({ success: true, deletedFiles: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Drive permanent delete failed" });
  }
});
