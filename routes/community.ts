import { Router } from "express";
import { pool, isUsingDatabase } from "../config/database.js";
import { authenticateToken, isAdmin } from "../middleware/auth.js";

export const communityRouter = Router();

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
