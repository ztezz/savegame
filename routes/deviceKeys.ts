import { Router } from "express";
import * as crypto from "crypto";
import { pool, isUsingDatabase } from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";

export const deviceKeysRouter = Router();

function generateKey(): string {
  return crypto.randomBytes(32).toString("hex"); // 64 hex chars
}

// POST /api/device-keys/import  — đăng ký key do agent tự sinh
deviceKeysRouter.post("/api/device-keys/import", authenticateToken, async (req: any, res) => {
  const deviceName = (req.body?.device_name ?? "").toString().trim();
  const apiKey = (req.body?.api_key ?? "").toString().trim();

  if (!deviceName) return res.status(400).json({ error: "device_name is required" });
  if (!apiKey) return res.status(400).json({ error: "api_key is required" });
  if (apiKey.length < 32) return res.status(400).json({ error: "api_key quá ngắn" });

  if (!isUsingDatabase()) {
    return res.status(501).json({ error: "Device keys require database mode" });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO device_api_keys (user_id, device_name, api_key, note)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (api_key) DO NOTHING
       RETURNING id, device_name, created_at`,
      [req.user.id, deviceName, apiKey, "Imported from agent"]
    );
    if (rows.length === 0) {
      return res.status(409).json({ error: "Key này đã được đăng ký" });
    }
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error("❌ Import device key error:", err);
    return res.status(500).json({ error: "Database error" });
  }
});

// POST /api/device-keys  — sinh key mới cho một device
deviceKeysRouter.post("/api/device-keys", authenticateToken, async (req: any, res) => {
  const deviceName = (req.body?.device_name ?? "").toString().trim();
  const note = (req.body?.note ?? "").toString().trim() || null;

  if (!deviceName) {
    return res.status(400).json({ error: "device_name is required" });
  }

  if (!isUsingDatabase()) {
    return res.status(501).json({ error: "Device keys require database mode" });
  }

  try {
    const key = generateKey();
    const { rows } = await pool.query(
      `INSERT INTO device_api_keys (user_id, device_name, api_key, note)
       VALUES ($1, $2, $3, $4)
       RETURNING id, device_name, api_key, note, created_at`,
      [req.user.id, deviceName, key, note]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error("❌ Create device key error:", err);
    return res.status(500).json({ error: "Database error" });
  }
});

// GET /api/device-keys  — liệt kê keys của user (ẩn key thật, chỉ hiện preview)
deviceKeysRouter.get("/api/device-keys", authenticateToken, async (req: any, res) => {
  if (!isUsingDatabase()) {
    return res.json([]);
  }

  try {
    const { rows } = await pool.query(
      `SELECT dk.id, dk.device_name,
               substr(dk.api_key, 1, 8) || '...' AS key_preview,
              dk.note, dk.created_at, dk.last_used_at,
              ah.last_seen,
               (ah.last_seen IS NOT NULL AND ah.last_seen > datetime('now', '-2 minutes')) AS is_online
       FROM device_api_keys dk
       LEFT JOIN agent_heartbeats ah
         ON ah.user_id = dk.user_id AND ah.device_name = dk.device_name
       WHERE dk.user_id = $1
       ORDER BY dk.created_at DESC`,
      [req.user.id]
    );
    return res.json(rows);
  } catch (err) {
    console.error("❌ List device keys error:", err);
    return res.status(500).json({ error: "Database error" });
  }
});

// DELETE /api/device-keys - thu hoi nhieu key theo danh sach id
deviceKeysRouter.delete("/api/device-keys", authenticateToken, async (req: any, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
    : [];

  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) {
    return res.status(400).json({ error: "ids must be a non-empty array" });
  }

  if (!isUsingDatabase()) {
    return res.status(501).json({ error: "Device keys require database mode" });
  }

  try {
    const placeholders = uniqueIds.map((_, index) => `$${index + 2}`).join(', ');
    const { rowCount } = await pool.query(
      `DELETE FROM device_api_keys WHERE user_id = $1 AND id IN (${placeholders})`,
      [req.user.id, ...uniqueIds]
    );
    return res.json({ success: true, deleted: rowCount ?? 0 });
  } catch (err) {
    console.error("Bulk delete device keys error:", err);
    return res.status(500).json({ error: "Database error" });
  }
});

// DELETE /api/device-keys/:id  — thu hồi key
deviceKeysRouter.delete("/api/device-keys/:id", authenticateToken, async (req: any, res) => {
  const keyId = parseInt(req.params.id);
  if (Number.isNaN(keyId)) {
    return res.status(400).json({ error: "Invalid key id" });
  }

  if (!isUsingDatabase()) {
    return res.status(501).json({ error: "Device keys require database mode" });
  }

  try {
    const { rowCount } = await pool.query(
      "DELETE FROM device_api_keys WHERE id = $1 AND user_id = $2",
      [keyId, req.user.id]
    );
    if (!rowCount) {
      return res.status(404).json({ error: "Key not found" });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("❌ Delete device key error:", err);
    return res.status(500).json({ error: "Database error" });
  }
});
