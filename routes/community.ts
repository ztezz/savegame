import { Router } from "express";
import { pool, isUsingDatabase } from "../config/database.js";
import { authenticateToken, isAdmin } from "../middleware/auth.js";

export const communityRouter = Router();

async function getActiveBan(userId: number) {
  const { rows } = await pool.query(
    `SELECT cb.user_id, cb.reason, cb.banned_until, cb.created_at, u.username, u.display_name
     FROM community_bans cb
     JOIN users u ON u.id = cb.user_id
     WHERE cb.user_id = $1 AND (cb.banned_until IS NULL OR cb.banned_until > NOW())`,
    [userId]
  );
  return rows[0] || null;
}

communityRouter.get("/api/community/bans", authenticateToken, isAdmin, async (_req: any, res) => {
  if (!isUsingDatabase()) return res.json([]);

  try {
    const { rows } = await pool.query(
      `SELECT cb.user_id, cb.reason, cb.banned_until, cb.created_at,
              u.username, u.display_name, u.role,
              admin.username AS banned_by_username
       FROM community_bans cb
       JOIN users u ON u.id = cb.user_id
       LEFT JOIN users admin ON admin.id = cb.banned_by
       WHERE cb.banned_until IS NULL OR cb.banned_until > NOW()
       ORDER BY cb.created_at DESC`
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load chat bans" });
  }
});

communityRouter.post("/api/community/bans", authenticateToken, isAdmin, async (req: any, res) => {
  if (!isUsingDatabase()) return res.status(400).json({ error: "Chat moderation requires database mode" });
  const userId = Number(req.body?.userId);
  const durationMinutes = req.body?.durationMinutes === null ? null : Number(req.body?.durationMinutes || 60);
  const reason = String(req.body?.reason || "").trim() || null;

  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: "Invalid user id" });
  if (userId === req.user.id) return res.status(400).json({ error: "You cannot ban yourself" });
  if (durationMinutes !== null && (!Number.isFinite(durationMinutes) || durationMinutes < 1)) {
    return res.status(400).json({ error: "Invalid ban duration" });
  }

  try {
    const user = await pool.query('SELECT id, role FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) return res.status(404).json({ error: "User not found" });
    if (user.rows[0].role === 'Admin') return res.status(400).json({ error: "Cannot ban an admin" });

    const { rows } = await pool.query(
      `INSERT INTO community_bans (user_id, reason, banned_by, banned_until, created_at)
       VALUES ($1, $2, $3, CASE WHEN $4::int IS NULL THEN NULL ELSE NOW() + ($4::int * INTERVAL '1 minute') END, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET reason = EXCLUDED.reason,
           banned_by = EXCLUDED.banned_by,
           banned_until = EXCLUDED.banned_until,
           created_at = NOW()
       RETURNING user_id, reason, banned_until, created_at`,
      [userId, reason, req.user.id, durationMinutes]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to ban user" });
  }
});

communityRouter.delete("/api/community/bans/:userId", authenticateToken, isAdmin, async (req: any, res) => {
  if (!isUsingDatabase()) return res.json({ success: true });
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: "Invalid user id" });

  try {
    await pool.query('DELETE FROM community_bans WHERE user_id = $1', [userId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to unban user" });
  }
});

communityRouter.get("/api/community/stats", authenticateToken, isAdmin, async (_req: any, res) => {
  if (!isUsingDatabase()) return res.json({ messageCount: 0, userCount: 0, latestAt: null });

  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS message_count,
              COUNT(DISTINCT user_id)::int AS user_count,
              MAX(created_at) AS latest_at
       FROM community_messages`
    );
    res.json(rows[0] || { message_count: 0, user_count: 0, latest_at: null });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load chat stats" });
  }
});

communityRouter.get("/api/community/messages", authenticateToken, async (req: any, res) => {
  if (!isUsingDatabase()) return res.json([]);

  const afterId = Number(req.query.afterId || 0);
  const limit = Math.min(Math.max(Number(req.query.limit || 80), 1), 200);

  try {
    const params: any[] = [];
    let where = "";
    if (Number.isInteger(afterId) && afterId > 0) {
      params.push(afterId);
      where = `WHERE cm.id > $${params.length}`;
    }
    params.push(limit);

    const { rows } = await pool.query(
      `SELECT cm.id, cm.user_id, cm.message, cm.created_at, u.username, u.display_name, u.role
       FROM community_messages cm
       JOIN users u ON u.id = cm.user_id
       ${where}
       ORDER BY cm.id DESC
       LIMIT $${params.length}`,
      params
    );

    res.json(rows.reverse());
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load messages" });
  }
});

communityRouter.post("/api/community/messages", authenticateToken, async (req: any, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) return res.status(400).json({ error: "Message is required" });
  if (message.length > 1000) return res.status(400).json({ error: "Message is too long" });
  if (!isUsingDatabase()) return res.status(400).json({ error: "Community chat requires database mode" });

  try {
    const activeBan = await getActiveBan(req.user.id);
    if (activeBan) {
      return res.status(403).json({
        error: activeBan.banned_until
          ? `Bạn đang bị khóa chat đến ${new Date(activeBan.banned_until).toLocaleString('vi-VN')}`
          : "Bạn đang bị khóa chat vĩnh viễn",
        ban: activeBan,
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO community_messages (user_id, message)
       VALUES ($1, $2)
       RETURNING id, user_id, message, created_at`,
      [req.user.id, message]
    );

    res.status(201).json({ ...rows[0], username: req.user.username, display_name: req.user.display_name || req.user.username, role: req.user.role });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to send message" });
  }
});

communityRouter.delete("/api/community/messages/:id", authenticateToken, async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid message id" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "Message not found" });

  try {
    const { rows } = await pool.query(
      `DELETE FROM community_messages
       WHERE id = $1 AND (user_id = $2 OR $3 = 'Admin')
       RETURNING id`,
      [id, req.user.id, req.user.role]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Message not found or unauthorized" });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete message" });
  }
});

communityRouter.delete("/api/community/messages", authenticateToken, isAdmin, async (_req: any, res) => {
  if (!isUsingDatabase()) return res.json({ success: true, deleted: 0 });

  try {
    const result = await pool.query("DELETE FROM community_messages");
    res.json({ success: true, deleted: result.rowCount || 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to clear chat" });
  }
});

communityRouter.post("/api/community/cleanup", authenticateToken, isAdmin, async (req: any, res) => {
  if (!isUsingDatabase()) return res.json({ success: true, deleted: 0 });
  const keepLatest = Math.max(0, Math.min(Number(req.body?.keepLatest || 200), 5000));

  try {
    const result = await pool.query(
      `DELETE FROM community_messages
       WHERE id NOT IN (
         SELECT id FROM community_messages ORDER BY id DESC LIMIT $1
       )`,
      [keepLatest]
    );
    res.json({ success: true, keepLatest, deleted: result.rowCount || 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to cleanup chat" });
  }
});
