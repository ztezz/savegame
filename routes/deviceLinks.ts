import { Router } from "express";
import * as crypto from "crypto";
import { pool, isUsingDatabase } from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";
import { FRONTEND_APP_URL, FRONTEND_ORIGIN } from "../config/environment.js";

export const deviceLinksRouter = Router();

const LINK_TTL_MINUTES = 10;

function generateToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

function getFrontendBaseUrl(req: any): string {
  if (FRONTEND_APP_URL) {
    return FRONTEND_APP_URL.replace(/\/$/, "");
  }

  const origins = Array.isArray(FRONTEND_ORIGIN) ? FRONTEND_ORIGIN : [FRONTEND_ORIGIN];
  const isFrontendOrigin = (origin: unknown) =>
    typeof origin === "string" &&
    origin.startsWith("http") &&
    !origin.includes("localhost") &&
    !origin.includes("127.0.0.1") &&
    !origin.includes("/api") &&
    !origin.includes("api-");

  const preferredPublic = origins.find((origin) =>
    isFrontendOrigin(origin) && origin.startsWith("https://")
  );

  if (preferredPublic) {
    return preferredPublic.replace(/\/$/, "");
  }

  const preferred = origins.find(isFrontendOrigin);

  if (preferred) {
    return preferred.replace(/\/$/, "");
  }

  return `${req.protocol}://${req.get("host")}`.replace(/\/$/, "");
}

// POST /api/device-links/start
// Agent calls this when it is unauthorized to initiate browser-based linking flow.
deviceLinksRouter.post("/api/device-links/start", async (req: any, res) => {
  const deviceName = (req.body?.device_name ?? "").toString().trim();
  const apiKey = (req.body?.api_key ?? "").toString().trim();

  if (!deviceName) return res.status(400).json({ error: "device_name is required" });
  if (!apiKey) return res.status(400).json({ error: "api_key is required" });
  if (apiKey.length < 32) return res.status(400).json({ error: "api_key is too short" });

  if (!isUsingDatabase()) {
    return res.status(501).json({ error: "Device linking requires database mode" });
  }

  try {
    const existingKey = await pool.query(
      "SELECT id FROM device_api_keys WHERE api_key = $1",
      [apiKey]
    );

    if (existingKey.rows.length > 0) {
      return res.json({ already_linked: true });
    }

    const token = generateToken();
    const frontendBase = getFrontendBaseUrl(req);
    const verificationUrl = `${frontendBase}/?device_link=${token}`;

    await pool.query(
      `INSERT INTO device_link_sessions (token, device_name, api_key, status, expires_at)
       VALUES ($1, $2, $3, 'pending', NOW() + INTERVAL '${LINK_TTL_MINUTES} minutes')
       ON CONFLICT (api_key) DO UPDATE
       SET token = EXCLUDED.token,
           device_name = EXCLUDED.device_name,
           status = 'pending',
           expires_at = NOW() + INTERVAL '${LINK_TTL_MINUTES} minutes',
           claimed_by_user_id = NULL,
           approved_at = NULL,
           created_at = NOW()`,
      [token, deviceName, apiKey]
    );

    return res.json({
      token,
      verification_url: verificationUrl,
      expires_in_seconds: LINK_TTL_MINUTES * 60,
      already_linked: false,
    });
  } catch (err) {
    console.error("❌ Start device link error:", err);
    return res.status(500).json({ error: "Database error" });
  }
});

// GET /api/device-links/:token
// Public endpoint for link status screen in web UI.
deviceLinksRouter.get("/api/device-links/:token", async (req, res) => {
  const token = (req.params.token ?? "").toString().trim();
  if (!token) return res.status(400).json({ error: "token is required" });

  if (!isUsingDatabase()) {
    return res.status(501).json({ error: "Device linking requires database mode" });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, device_name, status, expires_at, approved_at
       FROM device_link_sessions
       WHERE token = $1`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Link session not found" });
    }

    const row = rows[0];
    const now = new Date();
    const expiresAt = new Date(row.expires_at);
    const isExpired = row.status !== "approved" && expiresAt.getTime() <= now.getTime();

    if (isExpired && row.status !== "expired") {
      await pool.query(
        "UPDATE device_link_sessions SET status = 'expired' WHERE id = $1",
        [row.id]
      );
      row.status = "expired";
    }

    return res.json({
      device_name: row.device_name,
      status: row.status,
      expires_at: row.expires_at,
      approved_at: row.approved_at,
    });
  } catch (err) {
    console.error("❌ Get device link session error:", err);
    return res.status(500).json({ error: "Database error" });
  }
});

// POST /api/device-links/:token/confirm
// Authenticated endpoint to bind the pending device key to the current user.
deviceLinksRouter.post("/api/device-links/:token/confirm", authenticateToken, async (req: any, res) => {
  const token = (req.params.token ?? "").toString().trim();
  if (!token) return res.status(400).json({ error: "token is required" });

  if (!isUsingDatabase()) {
    return res.status(501).json({ error: "Device linking requires database mode" });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, device_name, api_key, status, expires_at
       FROM device_link_sessions
       WHERE token = $1`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Link session not found" });
    }

    const session = rows[0];
    const now = new Date();
    const isExpired = new Date(session.expires_at).getTime() <= now.getTime();

    if (session.status === "approved") {
      return res.json({ success: true, already_confirmed: true });
    }

    if (isExpired) {
      await pool.query(
        "UPDATE device_link_sessions SET status = 'expired' WHERE id = $1",
        [session.id]
      );
      return res.status(410).json({ error: "Link session expired" });
    }

    const existing = await pool.query(
      "SELECT id, user_id FROM device_api_keys WHERE api_key = $1",
      [session.api_key]
    );

    if (existing.rows.length > 0) {
      const ownerId = Number(existing.rows[0].user_id);
      if (ownerId !== Number(req.user.id)) {
        return res.status(409).json({ error: "This device key is linked to another account" });
      }

      await pool.query(
        `UPDATE device_link_sessions
         SET status = 'approved', claimed_by_user_id = $1, approved_at = NOW()
         WHERE id = $2`,
        [req.user.id, session.id]
      );

      return res.json({ success: true, already_confirmed: true });
    }

    await pool.query(
      `INSERT INTO device_api_keys (user_id, device_name, api_key, note)
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, session.device_name, session.api_key, "Linked via web login"]
    );

    await pool.query(
      `UPDATE device_link_sessions
       SET status = 'approved', claimed_by_user_id = $1, approved_at = NOW()
       WHERE id = $2`,
      [req.user.id, session.id]
    );

    return res.status(201).json({ success: true, already_confirmed: false });
  } catch (err) {
    console.error("❌ Confirm device link error:", err);
    return res.status(500).json({ error: "Database error" });
  }
});
