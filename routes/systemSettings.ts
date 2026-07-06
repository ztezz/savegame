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

const uploadAgentFile = (req: any, res: any, next: any) => {
  upload.any()(req, res, (err: any) => {
    if (!err) return next();

    const message = err?.message || 'Upload failed';
    console.warn('⚠️ Windows agent upload failed:', message);

    if (message.toLowerCase().includes('request aborted')) {
      return res.status(499).json({ error: 'Upload bị ngắt kết nối trước khi hoàn tất. Vui lòng thử lại với mạng ổn định hơn.' });
    }

    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File quá lớn so với giới hạn upload hiện tại.' });
    }

    return res.status(400).json({ error: message });
  });
};

function collectStorageUsage(dir: string) {
  const result = { totalBytes: 0, fileCount: 0, directories: [] as Array<{ name: string; bytes: number; files: number }> };
  if (!fs.existsSync(dir)) return result;

  const walk = (target: string): { bytes: number; files: number } => {
    let bytes = 0;
    let files = 0;
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      const entryPath = path.join(target, entry.name);
      if (entry.isDirectory()) {
        const child = walk(entryPath);
        bytes += child.bytes;
        files += child.files;
      } else if (entry.isFile()) {
        const stat = fs.statSync(entryPath);
        bytes += stat.size;
        files += 1;
      }
    }
    return { bytes, files };
  };

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const child = walk(entryPath);
      result.directories.push({ name: entry.name, bytes: child.bytes, files: child.files });
      result.totalBytes += child.bytes;
      result.fileCount += child.files;
    } else if (entry.isFile()) {
      const stat = fs.statSync(entryPath);
      result.totalBytes += stat.size;
      result.fileCount += 1;
    }
  }

  result.directories.sort((a, b) => b.bytes - a.bytes);
  return result;
}

const DEFAULT_SETTINGS = {
  security: { enforceStrongPassword: true, sessionTimeoutMinutes: 120, allowSelfRegister: false },
  sync: { autoSyncEnabled: false, syncIntervalMinutes: 5, maxUploadSizeMb: 2048, retentionDays: 30, retryLimit: 2 },
  ui: { compactMode: false, language: "vi", showAdvancedStats: true },
  technical: { smtpHost: "", smtpPort: 587, smtpSecure: false, backupEnabled: false },
  ai: { enabled: false, provider: "9router", apiKey: "", model: "cx/gpt-5.5", botName: "Mây Mặn", baseUrl: "https://api.9router.com/v1", humorLevel: "funny" },
  windowsAgent: { filename: WINDOWS_AGENT_FILENAME, version: "", size: 0, updatedAt: null, available: false }
};

settingsRouter.get('/api/system/settings', authenticateToken, async (_req: any, res) => {
  if (!isUsingDatabase()) return res.json(DEFAULT_SETTINGS);
  try {
    const { rows } = await pool.query('SELECT key, value_json FROM system_settings');
    const data: any = { ...DEFAULT_SETTINGS };
    for (const row of rows) data[row.key] = row.value_json;
    data.ai = { ...DEFAULT_SETTINGS.ai, ...(data.ai || {}) };
    if (data.ai.apiKey) data.ai.apiKey = '********';
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
  const keys = ['security', 'sync', 'ui', 'technical', 'ai', WINDOWS_AGENT_SETTINGS_KEY];
  if (!isUsingDatabase()) return res.json({ success: true, settings: { ...DEFAULT_SETTINGS, ...payload } });

  try {
    for (const key of keys) {
      if (payload[key] === undefined) continue;
      let value = payload[key];
      if (key === 'ai') {
        const existing = await pool.query("SELECT value_json FROM system_settings WHERE key = 'ai'");
        const existingAi = existing.rows[0]?.value_json || DEFAULT_SETTINGS.ai;
        value = { ...DEFAULT_SETTINGS.ai, ...existingAi, ...payload.ai };
        if (payload.ai?.apiKey === '********') value.apiKey = existingAi.apiKey || '';
      }
      await pool.query(
        `INSERT INTO system_settings (key, value_json, updated_by, updated_at)
         VALUES ($1, $2::jsonb, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [key, JSON.stringify(value), req.user?.id || null]
      );
    }
    await writeAudit(req.user?.id || null, 'UPDATE', 'system_settings', { keys: Object.keys(payload) });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Database error' });
  }
});

settingsRouter.post('/api/system/agent/windows', authenticateToken, isAdmin, uploadAgentFile, async (req: any, res) => {
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
    const nextAgentPath = path.join(WINDOWS_AGENT_DIR, `${WINDOWS_AGENT_FILENAME}.next`);
    const backupAgentPath = path.join(WINDOWS_AGENT_DIR, `${WINDOWS_AGENT_FILENAME}.bak`);

    if (fs.existsSync(nextAgentPath)) fs.unlinkSync(nextAgentPath);
    fs.renameSync(file.path, nextAgentPath);

    if (fs.existsSync(backupAgentPath)) fs.unlinkSync(backupAgentPath);
    if (fs.existsSync(WINDOWS_AGENT_PATH)) fs.renameSync(WINDOWS_AGENT_PATH, backupAgentPath);

    try {
      fs.renameSync(nextAgentPath, WINDOWS_AGENT_PATH);
      if (fs.existsSync(backupAgentPath)) fs.unlinkSync(backupAgentPath);
    } catch (replaceErr) {
      if (fs.existsSync(backupAgentPath) && !fs.existsSync(WINDOWS_AGENT_PATH)) {
        fs.renameSync(backupAgentPath, WINDOWS_AGENT_PATH);
      }
      throw replaceErr;
    }

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

settingsRouter.get('/api/system/storage', authenticateToken, isAdmin, async (_req: any, res) => {
  try {
    const usage = collectStorageUsage(UPLOADS_DIR_PATH);
    let database: any = null;

    if (isUsingDatabase()) {
      const { rows } = await pool.query(`
        SELECT
          COUNT(*)::int AS save_count,
          COALESCE(SUM(file_size), 0)::bigint AS save_bytes,
          COUNT(DISTINCT g.user_id)::int AS user_count,
          COUNT(DISTINCT g.id)::int AS game_count
        FROM saves s
        JOIN games g ON g.id = s.game_id
      `);
      database = rows[0] || null;
    }

    res.json({ uploadDir: UPLOADS_DIR_PATH, ...usage, database });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to read storage usage' });
  }
});

settingsRouter.post('/api/system/storage/cleanup', authenticateToken, isAdmin, async (req: any, res) => {
  const keepLatest = Math.max(1, Math.min(Number(req.body?.keepLatest || 5), 50));
  const dryRun = req.body?.dryRun !== false;

  if (!isUsingDatabase()) return res.status(400).json({ error: 'Cleanup requires database mode' });

  try {
    const { rows } = await pool.query(
      `SELECT id, file_path, file_size
       FROM (
         SELECT s.id, s.file_path, s.file_size,
                ROW_NUMBER() OVER (PARTITION BY s.game_id ORDER BY s.version DESC, s.created_at DESC, s.id DESC) AS rn
         FROM saves s
       ) ranked
       WHERE rn > $1`,
      [keepLatest]
    );

    let deletedFiles = 0;
    let deletedBytes = 0;

    if (!dryRun && rows.length > 0) {
      for (const save of rows) {
        const filePath = path.join(UPLOADS_DIR_PATH, save.file_path);
        if (fs.existsSync(filePath)) {
          try {
            const stat = fs.statSync(filePath);
            fs.unlinkSync(filePath);
            deletedFiles += 1;
            deletedBytes += stat.size;
          } catch (err: any) {
            console.warn(`Could not delete old save file ${filePath}: ${err.message}`);
          }
        }
      }

      await pool.query('DELETE FROM saves WHERE id = ANY($1::int[])', [rows.map((row: any) => row.id)]);
      await writeAudit(req.user?.id || null, 'CLEANUP', 'storage', { keepLatest, deletedRows: rows.length, deletedFiles, deletedBytes });
    }

    res.json({ dryRun, keepLatest, candidates: rows.length, deletedFiles, deletedBytes });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Cleanup failed' });
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

