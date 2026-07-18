import { Router } from "express";
import * as bcrypt from "bcryptjs";
import * as fs from "fs";
import * as path from "path";
import multer from "multer";
import { pool, isUsingDatabase } from "../config/database.js";
import { authenticateToken, isAdmin } from "../middleware/auth.js";
import { User } from "../database/types.js";
import { UPLOADS_DIR_PATH } from "../config/multer.js";

// Mock users (shared with auth router via import)
let users: User[] = [];
let nextId = 2;

export const usersRouter = Router();

// Avatar upload config
const avatarDir = path.join(UPLOADS_DIR_PATH, "avatars");
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarDir),
  filename: (req: any, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `avatar_${req.user?.id}_${Date.now()}${ext}`);
  },
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files allowed"));
  },
});

// ─── GET /api/users/me ────────────────────────────────────────────────────────
usersRouter.get("/api/users/me", authenticateToken, async (req: any, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        'SELECT id, username, display_name, email, role, status, drive_quota_mb, avatar_url, created_at FROM users WHERE id = $1',
        [userId]
      );
      if (rows.length === 0) return res.status(404).json({ error: "User not found" });
      return res.json({ ...rows[0], name: rows[0].display_name, createdAt: rows[0].created_at });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  const user = users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  const { passwordHash, ...safeUser } = user as any;
  return res.json(safeUser);
});

// ─── PUT /api/users/me ────────────────────────────────────────────────────────
usersRouter.put("/api/users/me", authenticateToken, async (req: any, res) => {
  const userId = req.user?.id;
  const { display_name, email } = req.body;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  if (display_name !== undefined && String(display_name).trim().length < 2) {
    return res.status(400).json({ error: "Display name must be at least 2 characters" });
  }
  if (email !== undefined && String(email).trim() && !/^\S+@\S+\.\S+$/.test(String(email).trim())) {
    return res.status(400).json({ error: "Invalid email" });
  }

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        'UPDATE users SET display_name = COALESCE($1, display_name), email = COALESCE($2, email) WHERE id = $3 RETURNING id, username, display_name, email, role, status, avatar_url, created_at',
        [display_name ? String(display_name).trim() : null, email ? String(email).trim() : null, userId]
      );
      if (rows.length === 0) return res.status(404).json({ error: "User not found" });
      return res.json({ user: { ...rows[0], name: rows[0].display_name, createdAt: rows[0].created_at } });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return res.status(404).json({ error: "User not found" });
  (users[idx] as any).display_name = display_name ? String(display_name).trim() : (users[idx] as any).display_name;
  users[idx].email = email ? String(email).trim() : users[idx].email;
  const { passwordHash, ...safeUser } = users[idx] as any;
  return res.json({ user: safeUser });
});

// ─── POST /api/users/me/avatar ────────────────────────────────────────────────
usersRouter.post("/api/users/me/avatar", authenticateToken, avatarUpload.single("avatar"), async (req: any, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const avatarUrl = `/avatars/${req.file.filename}`;

  if (isUsingDatabase()) {
    try {
      // Delete old avatar file if exists
      const { rows: oldRows } = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [userId]);
      if (oldRows[0]?.avatar_url) {
        const oldFile = path.join(avatarDir, path.basename(oldRows[0].avatar_url));
        if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
      }
      await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, userId]);
      return res.json({ avatar_url: avatarUrl });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
  return res.json({ avatar_url: avatarUrl });
});

// ─── DELETE /api/users/me/avatar ─────────────────────────────────────────────
usersRouter.delete("/api/users/me/avatar", authenticateToken, async (req: any, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [userId]);
      if (rows[0]?.avatar_url) {
        const oldFile = path.join(avatarDir, path.basename(rows[0].avatar_url));
        if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
      }
      await pool.query('UPDATE users SET avatar_url = NULL WHERE id = $1', [userId]);
      return res.json({ message: "Avatar removed" });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
  return res.json({ message: "Avatar removed" });
});

// ─── GET /api/users/me/stats ──────────────────────────────────────────────────
usersRouter.get("/api/users/me/stats", authenticateToken, async (req: any, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  if (isUsingDatabase()) {
    try {
      const { rows: saveRows } = await pool.query(
        `SELECT COUNT(s.id) AS save_count, COALESCE(SUM(s.file_size), 0) AS save_bytes
         FROM games g LEFT JOIN saves s ON s.game_id = g.id
         WHERE g.user_id = $1`,
        [userId]
      );
      const { rows: driveRows } = await pool.query(
        `SELECT COALESCE(SUM(file_size), 0) AS drive_bytes, COUNT(*) AS drive_files
         FROM drive_files WHERE user_id = $1 AND deleted_at IS NULL`,
        [userId]
      );
      const { rows: deviceRows } = await pool.query(
        `SELECT COUNT(*) AS device_count FROM device_api_keys WHERE user_id = $1`,
        [userId]
      );
      const { rows: loginRows } = await pool.query(
        `SELECT created_at, ip_address, status FROM login_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [userId]
      );
      return res.json({
        save_count: Number(saveRows[0].save_count),
        save_bytes: Number(saveRows[0].save_bytes),
        drive_bytes: Number(driveRows[0].drive_bytes),
        drive_files: Number(driveRows[0].drive_files),
        device_count: Number(deviceRows[0].device_count),
        login_history: loginRows,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
  return res.json({ save_count: 0, save_bytes: 0, drive_bytes: 0, drive_files: 0, device_count: 0, login_history: [] });
});

// ─── GET /api/users ───────────────────────────────────────────────────────────
usersRouter.get("/api/users", authenticateToken, isAdmin, async (req, res) => {
  if (isUsingDatabase()) {
    try {
      const columns = await pool.query('PRAGMA table_info(users)');
      const hasAvatar = columns.rows.some((column: any) => column.name === 'avatar_url');
      const { rows } = await pool.query(`
        SELECT id, username, display_name, email, role, status, drive_quota_mb,
               ${hasAvatar ? 'avatar_url' : 'NULL AS avatar_url'}, created_at
        FROM users
        ORDER BY id ASC
      `);

      const [driveResult, saveResult] = await Promise.allSettled([
        pool.query(`
          SELECT user_id, COALESCE(SUM(file_size), 0) AS drive_used_bytes, COUNT(*) AS drive_file_count
          FROM drive_files WHERE deleted_at IS NULL GROUP BY user_id
        `),
        pool.query(`
          SELECT g.user_id, COUNT(s.id) AS save_count
          FROM games g LEFT JOIN saves s ON s.game_id = g.id GROUP BY g.user_id
        `),
      ]);

      const driveByUser = new Map<number, any>();
      if (driveResult.status === 'fulfilled') {
        driveResult.value.rows.forEach((row: any) => driveByUser.set(Number(row.user_id), row));
      } else {
        console.error('Failed to load user drive stats:', driveResult.reason?.message || driveResult.reason);
      }
      const savesByUser = new Map<number, number>();
      if (saveResult.status === 'fulfilled') {
        saveResult.value.rows.forEach((row: any) => savesByUser.set(Number(row.user_id), Number(row.save_count || 0)));
      } else {
        console.error('Failed to load user save stats:', saveResult.reason?.message || saveResult.reason);
      }

      res.json(rows.map((row: any) => {
        const drive = driveByUser.get(Number(row.id));
        return {
          ...row,
          name: row.display_name,
          createdAt: row.created_at,
          drive_used_bytes: Number(drive?.drive_used_bytes || 0),
          drive_file_count: Number(drive?.drive_file_count || 0),
          save_count: savesByUser.get(Number(row.id)) || 0,
        };
      }));
    } catch (err: any) {
      console.error('Failed to list users:', err?.message || err);
      res.status(500).json({ error: err.message });
    }
  } else {
    res.json(users.map(({ passwordHash, ...u }) => u));
  }
});

// ─── GET /api/users/export-csv ────────────────────────────────────────────────
usersRouter.get("/api/users/export-csv", authenticateToken, isAdmin, async (req, res) => {
  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(`
        SELECT u.id, u.username, u.display_name, u.email, u.role, u.status,
               u.drive_quota_mb, u.created_at,
               COALESCE(df.drive_used_bytes, 0) AS drive_used_bytes,
               COALESCE(sv.save_count, 0) AS save_count
        FROM users u
        LEFT JOIN (SELECT user_id, SUM(file_size) AS drive_used_bytes FROM drive_files WHERE deleted_at IS NULL GROUP BY user_id) df ON df.user_id = u.id
        LEFT JOIN (SELECT g.user_id, COUNT(s.id) AS save_count FROM games g LEFT JOIN saves s ON s.game_id = g.id GROUP BY g.user_id) sv ON sv.user_id = u.id
        ORDER BY u.id ASC
      `);
      const headers = ["ID", "Username", "Tên hiển thị", "Email", "Vai trò", "Trạng thái", "Drive Quota (MB)", "Drive đã dùng (bytes)", "Số save", "Ngày tạo"];
      const csvRows = rows.map(r => [
        r.id, r.username, r.display_name || "", r.email || "",
        r.role, r.status, r.drive_quota_mb || "",
        r.drive_used_bytes, r.save_count,
        r.created_at
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
      const csv = [headers.join(","), ...csvRows].join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="users_${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send("\uFEFF" + csv); // BOM for Excel UTF-8
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
  return res.status(400).json({ error: "Database required" });
});

// ─── GET /api/users/:id/detail ───────────────────────────────────────────────
usersRouter.get("/api/users/:id/detail", authenticateToken, isAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isUsingDatabase()) {
    try {
      const { rows: userRows } = await pool.query(
        'SELECT id, username, display_name, email, role, status, drive_quota_mb, avatar_url, created_at FROM users WHERE id = $1',
        [id]
      );
      if (userRows.length === 0) return res.status(404).json({ error: "User not found" });

      const { rows: saveRows } = await pool.query(
        `SELECT COUNT(s.id) AS save_count, COALESCE(SUM(s.file_size), 0) AS save_bytes
         FROM games g LEFT JOIN saves s ON s.game_id = g.id WHERE g.user_id = $1`,
        [id]
      );
      const { rows: driveRows } = await pool.query(
        `SELECT COALESCE(SUM(file_size), 0) AS drive_bytes, COUNT(*) AS drive_files
         FROM drive_files WHERE user_id = $1 AND deleted_at IS NULL`,
        [id]
      );
      const { rows: deviceRows } = await pool.query(
        `SELECT device_name, created_at, last_used_at FROM device_api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
        [id]
      );
      const { rows: loginRows } = await pool.query(
        `SELECT created_at, ip_address, status FROM login_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [id]
      );
      const { rows: gameRows } = await pool.query(
        `SELECT g.game_name, g.category, COUNT(s.id) AS save_count, MAX(s.created_at) AS last_save
         FROM games g LEFT JOIN saves s ON s.game_id = g.id
         WHERE g.user_id = $1 GROUP BY g.id ORDER BY last_save DESC LIMIT 10`,
        [id]
      );

      return res.json({
        ...userRows[0],
        name: userRows[0].display_name,
        createdAt: userRows[0].created_at,
        stats: {
          save_count: Number(saveRows[0].save_count),
          save_bytes: Number(saveRows[0].save_bytes),
          drive_bytes: Number(driveRows[0].drive_bytes),
          drive_files: Number(driveRows[0].drive_files),
          device_count: deviceRows.length,
        },
        devices: deviceRows,
        login_history: loginRows,
        recent_games: gameRows,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
  return res.status(400).json({ error: "Database required" });
});

// ─── POST /api/users ──────────────────────────────────────────────────────────
usersRouter.post("/api/users", authenticateToken, isAdmin, async (req, res) => {
  const { username, display_name, email, role, status, password, drive_quota_mb } = req.body;
  const passwordHash = password ? await bcrypt.hash(password, 10) : '';

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        'INSERT INTO users (username, display_name, email, role, status, password_hash, drive_quota_mb) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, username, display_name, email, role, status, drive_quota_mb, created_at',
        [username, display_name || username, email, role, status, passwordHash, drive_quota_mb ? Number(drive_quota_mb) : null]
      );
      res.status(201).json({ ...rows[0], name: rows[0].display_name });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } else {
    const newUser = { id: nextId++, username, email, role, status, passwordHash, createdAt: new Date().toISOString() };
    users.push(newUser);
    res.status(201).json(newUser);
  }
});

// ─── PUT /api/users/:id ───────────────────────────────────────────────────────
usersRouter.put("/api/users/:id", authenticateToken, isAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { username, display_name, email, role, status, password, drive_quota_mb } = req.body;

  if (isUsingDatabase()) {
    try {
      let query = 'UPDATE users SET username = $1, display_name = $2, email = $3, role = $4, status = $5, drive_quota_mb = $6';
      let params: any[] = [username, display_name || username, email, role, status, drive_quota_mb ? Number(drive_quota_mb) : null, id];
      if (password) {
        const passwordHash = await bcrypt.hash(password, 10);
        query += ', password_hash = $7 WHERE id = $8';
        params = [username, display_name || username, email, role, status, drive_quota_mb ? Number(drive_quota_mb) : null, passwordHash, id];
      } else {
        query += ' WHERE id = $7';
      }
      await pool.query(query, params);
      res.json({ message: "User updated" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } else {
    const userIndex = users.findIndex(u => u.id === id);
    if (userIndex === -1) return res.status(404).json({ error: "User not found" });
    users[userIndex] = { ...users[userIndex], username, email, role, status };
    if (password) users[userIndex].passwordHash = await bcrypt.hash(password, 10);
    res.json({ message: "User updated" });
  }
});

// ─── PATCH /api/users/:id/status ─────────────────────────────────────────────
usersRouter.patch("/api/users/:id/status", authenticateToken, isAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  if (!["Active", "Locked"].includes(status)) {
    return res.status(400).json({ error: "Status must be 'Active' or 'Locked'" });
  }
  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        'UPDATE users SET status = $1 WHERE id = $2 RETURNING id, username, status',
        [status, id]
      );
      if (rows.length === 0) return res.status(404).json({ error: "User not found" });
      return res.json({ message: "Status updated", user: rows[0] });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
  const userIndex = users.findIndex(u => u.id === id);
  if (userIndex === -1) return res.status(404).json({ error: "User not found" });
  users[userIndex].status = status;
  return res.json({ message: "Status updated" });
});

// ─── POST /api/users/:id/reset-password ──────────────────────────────────────
usersRouter.post("/api/users/:id/reset-password", authenticateToken, isAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { newPassword } = req.body;
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, username', [passwordHash, id]);
      if (rows.length === 0) return res.status(404).json({ error: "User not found" });
      return res.json({ message: "Password reset successfully" });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
  const userIndex = users.findIndex(u => u.id === id);
  if (userIndex === -1) return res.status(404).json({ error: "User not found" });
  users[userIndex].passwordHash = passwordHash;
  return res.json({ message: "Password reset successfully" });
});

// ─── POST /api/users/bulk-action ─────────────────────────────────────────────
usersRouter.post("/api/users/bulk-action", authenticateToken, isAdmin, async (req: any, res) => {
  const { action, ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "IDs array is required" });
  }
  const adminId = req.user?.id;
  // Prevent acting on self
  const safeIds = ids.filter((id: number) => id !== adminId);
  if (safeIds.length === 0) return res.status(400).json({ error: "Cannot perform bulk action on yourself" });

  if (isUsingDatabase()) {
    try {
      const placeholders = safeIds.map((_: any, i: number) => `$${i + 1}`).join(",");
      if (action === "lock") {
        await pool.query(`UPDATE users SET status = 'Locked' WHERE id IN (${placeholders})`, safeIds);
        return res.json({ message: `Locked ${safeIds.length} users` });
      } else if (action === "unlock") {
        await pool.query(`UPDATE users SET status = 'Active' WHERE id IN (${placeholders})`, safeIds);
        return res.json({ message: `Unlocked ${safeIds.length} users` });
      } else if (action === "delete") {
        await pool.query(`DELETE FROM users WHERE id IN (${placeholders})`, safeIds);
        return res.json({ message: `Deleted ${safeIds.length} users` });
      } else {
        return res.status(400).json({ error: "Invalid action. Use: lock, unlock, delete" });
      }
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
  return res.status(400).json({ error: "Database required" });
});

// ─── DELETE /api/users/:id ────────────────────────────────────────────────────
usersRouter.delete("/api/users/:id", authenticateToken, isAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isUsingDatabase()) {
    try {
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
      res.json({ message: "User deleted" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } else {
    users = users.filter(u => u.id !== id);
    res.json({ message: "User deleted" });
  }
});

export { users, nextId };
