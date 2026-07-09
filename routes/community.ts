import { Router } from "express";
import { pool, isUsingDatabase } from "../config/database.js";
import { authenticateToken, isAdmin } from "../middleware/auth.js";
import { compactJsonPreview, extractAiText, parseSseAiText } from "../utils/aiResponse.js";

export const communityRouter = Router();

const DEFAULT_AI_SETTINGS = {
  enabled: false,
  provider: "9router",
  apiKey: "",
  model: "cx/gpt-5.5",
  botName: "Mây Mặn",
  baseUrl: "https://api.9router.com/v1",
  humorLevel: "funny",
};

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

async function getAiSettings() {
  const { rows } = await pool.query("SELECT value_json FROM system_settings WHERE key = 'ai'");
  return { ...DEFAULT_AI_SETTINGS, ...(rows[0]?.value_json || {}) };
}

async function ensureRoom(roomId: number) {
  const { rows } = await pool.query('SELECT id, name, is_locked, ai_enabled FROM community_rooms WHERE id = $1 AND deleted_at IS NULL', [roomId]);
  return rows[0] || null;
}

async function fetchRecentChatContext(roomId: number, limit = 12) {
  const { rows } = await pool.query(
    `SELECT cm.message, cm.sender_type, cm.display_name,
            COALESCE(cm.display_name, u.display_name, u.username, 'Thành viên') AS author
     FROM community_messages cm
     LEFT JOIN users u ON u.id = cm.user_id
     WHERE cm.room_id = $1
     ORDER BY cm.id DESC
     LIMIT $2`,
    [roomId, limit]
  );
  return rows.reverse().map((row: any) => ({
    role: row.sender_type === 'ai' ? 'assistant' : 'user',
    content: `${row.author}: ${row.message}`,
  }));
}

async function generateAiReply(roomId: number, roomName: string) {
  const settings = await getAiSettings();
  if (!settings.enabled || !settings.apiKey) return null;
  if (settings.apiKey === '********') return null;

  const baseUrl = String(settings.baseUrl || DEFAULT_AI_SETTINGS.baseUrl).replace(/\/+$/, '');
  const context = await fetchRecentChatContext(roomId);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_AI_SETTINGS.model,
      stream: false,
      temperature: settings.humorLevel === 'chaos' ? 0.95 : 0.75,
      max_tokens: 1024,
      messages: [
        {
          role: 'system',
          content: `Bạn là ${settings.botName || DEFAULT_AI_SETTINGS.botName}, AI trong phòng chat ${roomName} của CloudSave. Trả lời bằng tiếng Việt, thân thiện, hài hước duyên dáng, hơi cà khịa nhẹ nhưng không xúc phạm. Không quá 3 câu. Nếu người dùng hỏi kỹ thuật thì trả lời hữu ích trước rồi mới pha trò.`,
        },
        ...context,
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`9router error ${response.status}: ${text.slice(0, 200)}`);
  }

  const rawText = await response.text();
  const sseReply = parseSseAiText(rawText);
  let data: any = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = null;
  }

  const reply = (sseReply || extractAiText(data)).slice(0, 1000);
  if (!reply) {
    const lengthLimited = rawText.includes('"finish_reason":"length"');
    throw new Error(lengthLimited
      ? 'Model hit output length before producing visible content. Try again or use a less reasoning-heavy model.'
      : `9router returned no readable content: ${(data ? compactJsonPreview(data, 220) : rawText.slice(0, 220))}`
    );
  }
  return reply;
}

async function insertAiMessage(roomId: number, message: string) {
  const settings = await getAiSettings();
  const { rows } = await pool.query(
    `INSERT INTO community_messages (room_id, user_id, message, sender_type, display_name)
     VALUES ($1, NULL, $2, 'ai', $3)
     RETURNING id, room_id, user_id, message, sender_type, display_name, created_at`,
    [roomId, message, settings.botName || DEFAULT_AI_SETTINGS.botName]
  );
  return { ...rows[0], username: 'ai-bot', role: 'AI' };
}

async function insertAiErrorMessage(roomId: number, error: string) {
  const message = `AI đang bật nhưng chưa trả lời được: ${error}`.slice(0, 1000);
  const { rows } = await pool.query(
    `INSERT INTO community_messages (room_id, user_id, message, sender_type, display_name)
     VALUES ($1, NULL, $2, 'ai', $3)
     RETURNING id`,
    [roomId, message, 'AI System']
  );
  return rows[0];
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

communityRouter.get("/api/community/rooms", authenticateToken, async (_req: any, res) => {
  if (!isUsingDatabase()) return res.json([]);

  try {
    const { rows } = await pool.query(
      `SELECT cr.id, cr.name, cr.description, cr.is_locked, cr.ai_enabled, cr.sort_order, cr.created_at,
              COUNT(cm.id)::int AS message_count,
              MAX(cm.created_at) AS latest_at
       FROM community_rooms cr
       LEFT JOIN community_messages cm ON cm.room_id = cr.id
       WHERE cr.deleted_at IS NULL
       GROUP BY cr.id
       ORDER BY cr.sort_order ASC, cr.id ASC`
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load chat rooms" });
  }
});

communityRouter.post("/api/community/rooms", authenticateToken, isAdmin, async (req: any, res) => {
  if (!isUsingDatabase()) return res.status(400).json({ error: "Chat rooms require database mode" });
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim() || null;
  const aiEnabled = req.body?.aiEnabled !== false;
  if (!name) return res.status(400).json({ error: "Room name is required" });
  if (name.length > 80) return res.status(400).json({ error: "Room name is too long" });
  if (description && description.length > 240) return res.status(400).json({ error: "Room description is too long" });

  try {
    const { rows } = await pool.query(
      `INSERT INTO community_rooms (name, description, created_by, ai_enabled, sort_order)
       VALUES ($1, $2, $3, $4, COALESCE((SELECT MAX(sort_order) + 1 FROM community_rooms), 0))
       RETURNING id, name, description, is_locked, ai_enabled, sort_order, created_at`,
      [name, description, req.user.id, aiEnabled]
    );
    res.status(201).json({ ...rows[0], message_count: 0, latest_at: null });
  } catch (err: any) {
    const duplicate = err?.code === '23505';
    res.status(duplicate ? 409 : 500).json({ error: duplicate ? "Room name already exists" : err.message || "Failed to create chat room" });
  }
});

communityRouter.patch("/api/community/rooms/:id", authenticateToken, isAdmin, async (req: any, res) => {
  if (!isUsingDatabase()) return res.status(400).json({ error: "Chat rooms require database mode" });
  const id = Number(req.params.id);
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim() || null;
  const isLocked = req.body?.isLocked === true;
  const aiEnabled = req.body?.aiEnabled !== false;
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid room id" });
  if (!name) return res.status(400).json({ error: "Room name is required" });
  if (name.length > 80) return res.status(400).json({ error: "Room name is too long" });
  if (description && description.length > 240) return res.status(400).json({ error: "Room description is too long" });

  try {
    const { rows } = await pool.query(
      `UPDATE community_rooms
       SET name = $1, description = $2, is_locked = $3, ai_enabled = $4
       WHERE id = $5 AND deleted_at IS NULL
       RETURNING id, name, description, is_locked, ai_enabled, sort_order, created_at`,
      [name, description, isLocked, aiEnabled, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Room not found" });
    res.json(rows[0]);
  } catch (err: any) {
    const duplicate = err?.code === '23505';
    res.status(duplicate ? 409 : 500).json({ error: duplicate ? "Room name already exists" : err.message || "Failed to update chat room" });
  }
});

communityRouter.delete("/api/community/rooms/:id", authenticateToken, isAdmin, async (req: any, res) => {
  if (!isUsingDatabase()) return res.json({ success: true });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid room id" });
  if (id === 1) return res.status(400).json({ error: "Default room cannot be deleted" });

  try {
    const { rows } = await pool.query(
      `UPDATE community_rooms SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Room not found" });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete chat room" });
  }
});

communityRouter.get("/api/community/stats", authenticateToken, isAdmin, async (req: any, res) => {
  if (!isUsingDatabase()) return res.json({ messageCount: 0, userCount: 0, latestAt: null });
  const roomId = Math.max(1, Number(req.query.roomId || 1));

  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS message_count,
              COUNT(DISTINCT user_id)::int AS user_count,
              MAX(created_at) AS latest_at
       FROM community_messages
       WHERE room_id = $1`,
      [roomId]
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
  const roomId = Math.max(1, Number(req.query.roomId || 1));

  try {
    const room = await ensureRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (room.is_locked && req.user.role !== 'Admin') return res.status(403).json({ error: "Phòng chat đang bị khóa" });

    const params: any[] = [roomId];
    let where = "WHERE cm.room_id = $1";
    if (Number.isInteger(afterId) && afterId > 0) {
      params.push(afterId);
      where += ` AND cm.id > $${params.length}`;
    }
    params.push(limit);

    const { rows } = await pool.query(
      `SELECT cm.id, cm.user_id, cm.message, cm.sender_type, cm.reply_to_id, cm.reactions_json, cm.edited_at, cm.pinned_at, cm.created_at,
              COALESCE(u.username, 'ai-bot') AS username,
              COALESCE(cm.display_name, u.display_name) AS display_name,
              COALESCE(u.role, CASE WHEN cm.sender_type = 'ai' THEN 'AI' ELSE NULL END) AS role
       FROM community_messages cm
       LEFT JOIN users u ON u.id = cm.user_id
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
  const replyToId = req.body?.replyToId ? Number(req.body.replyToId) : null;
  const roomId = Math.max(1, Number(req.body?.roomId || 1));
  if (!message) return res.status(400).json({ error: "Message is required" });
  if (message.length > 1000) return res.status(400).json({ error: "Message is too long" });
  if (replyToId !== null && (!Number.isInteger(replyToId) || replyToId <= 0)) return res.status(400).json({ error: "Invalid reply message id" });
  if (!isUsingDatabase()) return res.status(400).json({ error: "Community chat requires database mode" });

  try {
    const room = await ensureRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

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
      `INSERT INTO community_messages (room_id, user_id, message, reply_to_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, room_id, user_id, message, sender_type, display_name, reply_to_id, reactions_json, edited_at, pinned_at, created_at`,
      [roomId, req.user.id, message, replyToId]
    );

    const userMessage = { ...rows[0], username: req.user.username, display_name: req.user.display_name || req.user.username, role: req.user.role };
    res.status(201).json({ message: userMessage, aiMessage: null });

    void (async () => {
      try {
        if (!room.ai_enabled) return;
        const aiReply = await generateAiReply(roomId, room.name);
        if (aiReply) await insertAiMessage(roomId, aiReply);
      } catch (aiErr: any) {
        const message = aiErr?.message || String(aiErr);
        console.warn('AI chat reply failed:', message);
        await insertAiErrorMessage(roomId, message.slice(0, 220)).catch(() => undefined);
      }
    })();
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to send message" });
  }
});

communityRouter.post("/api/community/messages/:id/reactions", authenticateToken, async (req: any, res) => {
  const id = Number(req.params.id);
  const emoji = String(req.body?.emoji || '').trim().slice(0, 8);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid message id" });
  if (!emoji) return res.status(400).json({ error: "Emoji is required" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "Message not found" });

  try {
    const { rows } = await pool.query('SELECT reactions_json FROM community_messages WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: "Message not found" });
    const reactions = rows[0].reactions_json || {};
    const users = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
    const key = String(req.user.id);
    reactions[emoji] = users.includes(key) ? users.filter((userId: string) => userId !== key) : [...users, key];
    if (reactions[emoji].length === 0) delete reactions[emoji];
    const updated = await pool.query('UPDATE community_messages SET reactions_json = $1::jsonb WHERE id = $2 RETURNING reactions_json', [JSON.stringify(reactions), id]);
    res.json({ reactions_json: updated.rows[0].reactions_json });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update reaction" });
  }
});

communityRouter.post("/api/community/messages/:id/pin", authenticateToken, isAdmin, async (req: any, res) => {
  const id = Number(req.params.id);
  const pinned = req.body?.pinned !== false;
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid message id" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "Message not found" });

  try {
    const { rows } = await pool.query(
      `UPDATE community_messages SET pinned_at = ${pinned ? 'NOW()' : 'NULL'} WHERE id = $1 RETURNING id, pinned_at`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Message not found" });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update pinned message" });
  }
});

communityRouter.patch("/api/community/messages/:id", authenticateToken, async (req: any, res) => {
  const id = Number(req.params.id);
  const message = String(req.body?.message || '').trim();
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid message id" });
  if (!message) return res.status(400).json({ error: "Message is required" });
  if (message.length > 1000) return res.status(400).json({ error: "Message is too long" });
  if (!isUsingDatabase()) return res.status(404).json({ error: "Message not found" });

  try {
    const { rows } = await pool.query(
      `UPDATE community_messages
       SET message = $1, edited_at = NOW()
       WHERE id = $2 AND sender_type = 'user' AND (user_id = $3 OR $4 = 'Admin')
       RETURNING id, message, edited_at`,
      [message, id, req.user.id, req.user.role]
    );
    if (!rows[0]) return res.status(404).json({ error: "Message not found or unauthorized" });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to edit message" });
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
  const keepLatest = Math.max(0, Math.min(Number(req.body?.keepLatest || 10000), 10000));

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
