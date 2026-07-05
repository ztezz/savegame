import { Router } from "express";
import * as path from "path";
import * as fs from "fs";
import { pool, isUsingDatabase } from "../config/database.js";
import { upload, UPLOADS_DIR_PATH } from "../config/multer.js";
import { authenticateToken, isAdmin } from "../middleware/auth.js";
import { writeAudit } from "../utils/audit.js";

export const settingsRouter = Router();

const WINDOWS_AGENT_FILENAME = "Cloudsave.exe";
const WINDOWS_AGENT_SETTINGS_KEY = "windowsAgent";
const WINDOWS_AGENT_DIR = path.join(UPLOADS_DIR_PATH, "agent");
const WINDOWS_AGENT_PATH = path.join(WINDOWS_AGENT_DIR, WINDOWS_AGENT_FILENAME);

const DEFAULT_SETTINGS = {
  security: { enforceStrongPassword: true, sessionTimeoutMinutes: 120, allowSelfRegister: false },
  sync: { autoSyncEnabled: false, syncIntervalMinutes: 5, maxUploadSizeMb: 2048, retentionDays: 30, retryLimit: 2 },
  ui: { compactMode: false, language: "vi", showAdvancedStats: true },
  technical: { smtpHost: "", smtpPort: 587, smtpSecure: false, backupEnabled: false },
  windowsAgent: { filename: WINDOWS_AGENT_FILENAME, version: "", size: 0, updatedAt: null, available: false }
};

settingsRouter.get('/api/system/settings', authenticateToken, async (_req: any, res) => {
  if (!isUsingDatabase()) return res.json(DEFAULT_SETTINGS);
  try {
    const { rows } = await pool.query('SELECT key, value_json FROM system_settings');
    const data: any = { ...DEFAULT_SETTINGS };
    for (const row of rows) data[row.key] = row.value_json;
    data.windowsAgent = {
      ...DEFAULT_SETTINGS.windowsAgent,
      ...(data.windowsAgent || {}),
      available: fs.existsSync(WINDOWS_AGENT_PATH),
    };
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Database error' });
  }
});

settingsRouter.put('/api/system/settings', authenticateToken, isAdmin, async (req: any, res) => {
  const payload = req.body || {};
  const keys = ['security', 'sync', 'ui', 'technical', WINDOWS_AGENT_SETTINGS_KEY];
  if (!isUsingDatabase()) return res.json({ success: true, settings: { ...DEFAULT_SETTINGS, ...payload } });

  try {
    for (const key of keys) {
      if (payload[key] === undefined) continue;
      await pool.query(
        `INSERT INTO system_settings (key, value_json, updated_by, updated_at)
         VALUES ($1, $2::jsonb, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [key, JSON.stringify(payload[key]), req.user?.id || null]
      );
    }
    await writeAudit(req.user?.id || null, 'UPDATE', 'system_settings', { keys: Object.keys(payload) });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Database error' });
  }
});

settingsRouter.post('/api/system/agent/windows', authenticateToken, isAdmin, upload.any(), async (req: any, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  const file = files[0];
  const version = String(req.body?.version || '').trim();

  if (!file) return res.status(400).json({ error: 'Agent file is required' });
  if (path.extname(file.originalname).toLowerCase() !== '.exe') {
    fs.unlinkSync(file.path);
    return res.status(400).json({ error: 'Only .exe files are supported for CloudSave Agent' });
  }

  try {
    if (!fs.existsSync(WINDOWS_AGENT_DIR)) fs.mkdirSync(WINDOWS_AGENT_DIR, { recursive: true });
    if (fs.existsSync(WINDOWS_AGENT_PATH)) fs.unlinkSync(WINDOWS_AGENT_PATH);
    fs.renameSync(file.path, WINDOWS_AGENT_PATH);

    const stat = fs.statSync(WINDOWS_AGENT_PATH);
    const metadata = {
      filename: WINDOWS_AGENT_FILENAME,
      originalName: file.originalname,
      version,
      size: stat.size,
      updatedAt: new Date().toISOString(),
      available: true,
    };

    if (isUsingDatabase()) {
      await pool.query(
        `INSERT INTO system_settings (key, value_json, updated_by, updated_at)
         VALUES ($1, $2::jsonb, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [WINDOWS_AGENT_SETTINGS_KEY, JSON.stringify(metadata), req.user?.id || null]
      );
    }

    await writeAudit(req.user?.id || null, 'UPDATE', 'windows_agent', {
      filename: WINDOWS_AGENT_FILENAME,
      originalName: file.originalname,
      version,
      size: stat.size,
    });

    res.json({ success: true, windowsAgent: metadata });
  } catch (err: any) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    res.status(500).json({ error: err.message || 'Failed to update CloudSave Agent' });
  }
});

settingsRouter.get('/api/system/audit-logs', authenticateToken, isAdmin, async (req: any, res) => {
  if (!isUsingDatabase()) return res.json([]);
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10), 1), 200);
    const { rows } = await pool.query(
      `SELECT a.id, a.action, a.resource, a.detail_json, a.created_at, u.username
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Database error' });
  }
});

