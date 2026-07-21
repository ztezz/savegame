import { Router } from "express";
import { randomBytes } from "node:crypto";
import * as path from "node:path";
import { pool, isUsingDatabase } from "../config/database.js";
import { authenticateToken, requireApiKey } from "../middleware/auth.js";
import { upload, UPLOADS_DIR_PATH } from "../config/multer.js";
import { PUBLIC_API_ORIGIN, TASK_LEASE_SECONDS } from "../config/environment.js";
import { hashFile } from "../utils/save-artifact.js";

// Mock data
let games: any[] = [];
let saves: any[] = [];
let restoreCommands: any[] = [];
let restoreCommandId = 1;

export const syncRouter = Router();
const MAX_DEVICE_ID_LENGTH = 255;
const MAX_TASK_ERROR_LENGTH = 4000;
const MAX_LEASE_TOKEN_LENGTH = 256;

function parseDeviceId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const deviceId = value.trim();
  if (!deviceId || deviceId.length > MAX_DEVICE_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(deviceId)) return null;
  return deviceId;
}

function getArtifactPath(filePath: unknown): string | null {
  if (typeof filePath !== 'string' || !filePath) return null;
  const uploadsRoot = path.resolve(UPLOADS_DIR_PATH);
  const artifactPath = path.resolve(uploadsRoot, filePath);
  if (artifactPath === uploadsRoot || !artifactPath.startsWith(uploadsRoot + path.sep)) return null;
  return artifactPath;
}

function parseLeaseToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return token && token.length <= MAX_LEASE_TOKEN_LENGTH ? token : null;
}

function requireBoundDevice(req: any, res: any, deviceId: string | null): boolean {
  if (!deviceId || req.deviceName !== deviceId) {
    res.status(403).json({ error: "device_id does not match the authenticated API key" });
    return false;
  }
  return true;
}

function saveDownloadUrl(saveId: number) {
  return `${PUBLIC_API_ORIGIN}/api/save/download/${saveId}`;
}

function formatSqliteTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  return value.includes('T') ? (value.endsWith('Z') ? value : `${value}Z`) : `${value.replace(' ', 'T')}Z`;
}

async function ensureArtifactMetadata(save: any, client: any) {
  if (!save?.original_filename) throw new Error("Artifact original filename is unavailable; upload this save again");
  if (typeof save.sha256 === 'string' && /^[a-f0-9]{64}$/.test(save.sha256) && Number.isSafeInteger(Number(save.file_size))) {
    return { file_size: Number(save.file_size), sha256: save.sha256.toLowerCase(), original_filename: save.original_filename };
  }
  const artifactPath = getArtifactPath(save.file_path);
  if (!artifactPath) throw new Error("Artifact path is unavailable");
  const artifact = await hashFile(artifactPath);
  await client.query(
    `UPDATE saves SET file_size = $1, sha256 = $2 WHERE id = $3 AND (sha256 IS NULL OR sha256 = '')`,
    [artifact.fileSize, artifact.sha256, save.id]
  );
  return { file_size: artifact.fileSize, sha256: artifact.sha256, original_filename: save.original_filename };
}

async function isKnownDeviceForUser(userId: number, deviceId: string): Promise<boolean> {
  if (!deviceId) return false;

  if (isUsingDatabase()) {
    const { rows } = await pool.query(
      `SELECT EXISTS (
         SELECT 1
         FROM (
            SELECT device_name FROM agent_heartbeats WHERE user_id = $1
            UNION
            SELECT device_name FROM device_api_keys WHERE user_id = $1
            UNION
            SELECT device_name FROM restore_commands WHERE user_id = $1
         ) d
         WHERE d.device_name = $2
       ) AS known`,
      [userId, deviceId]
    );
    return Boolean(rows[0]?.known);
  }

  return restoreCommands.some((c: any) => c.userId === userId && c.deviceName === deviceId);
}

async function writeSyncLog(userId: number, deviceName: string | null, status: string, message: string) {
  // Bỏ qua hoàn toàn việc ghi sync log để giải phóng I/O và tối ưu hiệu suất tối đa
  return;
}

syncRouter.get("/api/sync/logs", authenticateToken, async (req: any, res) => {
  // Luôn trả về mảng rỗng để frontend hiển thị sạch sẽ và không tải cơ sở dữ liệu
  res.json([]);
});

syncRouter.post("/api/sync/log", authenticateToken, async (req: any, res) => {
  // Trả về thành công lập tức mà không thực hiện ghi đĩa
  res.json({ success: true });
});

syncRouter.get("/api/sync/devices", authenticateToken, async (req: any, res) => {
  if (isUsingDatabase()) {
    try {
      // Only show devices that have an active API key (are currently "connected")
      const { rows } = await pool.query(
        `SELECT DISTINCT device_name 
         FROM device_api_keys 
         WHERE user_id = $1 
         ORDER BY device_name ASC`,
        [req.user.id]
      );
      return res.json(rows.map((r: any) => r.device_name));
    } catch (err) {
      return res.status(500).json({ error: "Database error" });
    }
  }

  const devices = Array.from(new Set(
    restoreCommands
      .filter(c => c.userId === req.user.id && c.deviceName)
      .map(c => c.deviceName)
  ));
  res.json(devices);
});

syncRouter.post("/api/restore", authenticateToken, async (req: any, res) => {
  const saveId = Number(req.body?.save_id);
  const deviceId = parseDeviceId(req.body?.device_id);

  if (!Number.isInteger(saveId) || saveId <= 0) {
    return res.status(400).json({ error: "save_id must be a positive integer" });
  }
  if (!deviceId) {
    return res.status(400).json({ error: "device_id must be a non-empty string of at most 255 characters" });
  }

  if (isUsingDatabase()) {
    try {
      const saveRes = await pool.query(
        `SELECT s.id AS save_id, g.id AS game_id, g.game_name,
                COALESCE(s.custom_file_path, '') AS save_path
         FROM saves s
         JOIN games g ON g.id = s.game_id
         WHERE s.id = $1 AND g.user_id = $2`,
        [saveId, req.user.id]
      );

      if (saveRes.rows.length === 0) {
        return res.status(404).json({ error: "Save not found" });
      }

      const knownDevice = await isKnownDeviceForUser(req.user.id, deviceId);
      if (!knownDevice) {
        return res.status(400).json({ error: "Device not found or not registered" });
      }

      const saveRow = saveRes.rows[0];
      const queued = await pool.query(
        `INSERT INTO restore_commands (user_id, game_id, save_id, game_name, device_name, save_path, status, retry_count, max_retries, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'Pending', 0, 2, CURRENT_TIMESTAMP)
         RETURNING id, game_id, save_id, game_name, device_name, save_path, status, created_at`,
        [req.user.id, saveRow.game_id, saveRow.save_id, saveRow.game_name, deviceId, saveRow.save_path || null]
      );

      await writeSyncLog(req.user.id, deviceId, 'Info', `Queued restore task for save #${saveId}`);
      return res.status(201).json({
        message: "Restore task created",
        task: queued.rows[0],
      });
    } catch (err) {
      console.error('❌ Create restore task error:', err);
      return res.status(500).json({ error: "Database error" });
    }
  }

  const save = saves.find((s: any) => s.id === saveId);
  if (!save) {
    return res.status(404).json({ error: "Save not found" });
  }
  const game = games.find((g: any) => g.id === save.gameId && g.userId === req.user.id);
  if (!game) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const task = {
    id: restoreCommandId++,
    userId: req.user.id,
    gameId: game.id,
    saveId: save.id,
    gameName: game.gameName,
    deviceName: deviceId,
    savePath: save.customFilePath || null,
    status: 'Pending',
    createdAt: new Date().toISOString(),
    claimedAt: null,
    completedAt: null,
    errorMessage: null,
    retryCount: 0,
    maxRetries: 2,
  };
  restoreCommands.push(task);
  return res.status(201).json({ message: "Restore task created", task });
});

syncRouter.get("/api/task", authenticateToken, requireApiKey, async (req: any, res) => {
  const deviceId = parseDeviceId(req.query.device_id);
  if (!deviceId) {
    return res.status(400).json({ error: "device_id must be a non-empty string of at most 255 characters" });
  }
  if (!requireBoundDevice(req, res, deviceId)) return;

  if (isUsingDatabase()) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const candidateRes = await client.query(
        `SELECT candidate.id, candidate.save_id, s.file_path, s.file_size, s.sha256, s.original_filename
         FROM restore_commands candidate
         JOIN saves s ON s.id = candidate.save_id
         WHERE candidate.user_id = $1
           AND candidate.device_name = $2
           AND NOT EXISTS (
             SELECT 1 FROM restore_commands active
             WHERE active.user_id = $1 AND active.device_name = $2
               AND active.status = 'Running' AND active.lease_expires_at > CURRENT_TIMESTAMP
           )
           AND (candidate.status = 'Pending' OR
                (candidate.status = 'Running' AND (candidate.lease_expires_at IS NULL OR candidate.lease_expires_at <= CURRENT_TIMESTAMP)))
         ORDER BY CASE WHEN candidate.status = 'Running' THEN 0 ELSE 1 END,
                  candidate.created_at ASC, candidate.id ASC
         LIMIT 1`,
        [req.user.id, deviceId]
      );
      const candidate = candidateRes.rows[0];
      if (!candidate) {
        await client.query('COMMIT');
        return res.json({ task: null });
      }

      let artifact;
      try {
        artifact = await ensureArtifactMetadata(candidate, client);
      } catch (err) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: err instanceof Error ? err.message : "Artifact metadata unavailable" });
      }

      const leaseToken = randomBytes(32).toString('hex');
      const claimRes = await client.query(
        `UPDATE restore_commands
         SET status = 'Running', claimed_at = CURRENT_TIMESTAMP, lease_token = $1,
             lease_expires_at = datetime('now', '+' || $2 || ' seconds')
         WHERE id = $3 AND user_id = $4 AND device_name = $5
           AND (status = 'Pending' OR
                (status = 'Running' AND (lease_expires_at IS NULL OR lease_expires_at <= CURRENT_TIMESTAMP)))
         RETURNING id, game_id, save_id, game_name, device_name, save_path, status, created_at,
                   claimed_at, lease_token, lease_expires_at`,
        [leaseToken, TASK_LEASE_SECONDS, candidate.id, req.user.id, deviceId]
      );
      if (!claimRes.rows[0]) {
        await client.query('ROLLBACK');
        return res.json({ task: null });
      }
      await client.query('COMMIT');

      const claimedTask = claimRes.rows[0];
      await writeSyncLog(req.user.id, deviceId, 'Info', `Task #${claimedTask.id} claimed by agent`);
      return res.json({
        task: {
          id: claimedTask.id,
          game_id: claimedTask.game_id,
          save_id: claimedTask.save_id,
          game_name: claimedTask.game_name,
          device_id: claimedTask.device_name,
          save_path: claimedTask.save_path || null,
          status: claimedTask.status,
          created_at: claimedTask.created_at,
          claimed_at: claimedTask.claimed_at,
          lease_token: claimedTask.lease_token,
          lease_expires_at: formatSqliteTimestamp(claimedTask.lease_expires_at),
          lease_seconds: TASK_LEASE_SECONDS,
          file_url: saveDownloadUrl(claimedTask.save_id),
          ...artifact,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('❌ Claim task error:', err);
      return res.status(500).json({ error: "Database error" });
    } finally {
      client.release();
    }
  }

  return res.status(503).json({ error: "Task leasing requires persistent storage" });
});

syncRouter.post("/api/task/:id/renew", authenticateToken, requireApiKey, async (req: any, res) => {
  const taskId = Number(req.params.id);
  const deviceId = parseDeviceId(req.body?.device_id);
  const leaseToken = parseLeaseToken(req.body?.lease_token ?? req.body?.token);
  if (!Number.isInteger(taskId) || taskId <= 0) return res.status(400).json({ error: "Invalid task id" });
  if (!deviceId || !leaseToken) return res.status(400).json({ error: "device_id and lease_token are required" });
  if (!requireBoundDevice(req, res, deviceId)) return;

  try {
    const { rows } = await pool.query(
      `UPDATE restore_commands
       SET lease_expires_at = datetime('now', '+' || $1 || ' seconds')
       WHERE id = $2 AND user_id = $3 AND device_name = $4 AND status = 'Running'
         AND lease_token = $5 AND lease_expires_at > CURRENT_TIMESTAMP
       RETURNING id, lease_expires_at`,
      [TASK_LEASE_SECONDS, taskId, req.user.id, deviceId, leaseToken]
    );
    if (!rows[0]) return res.status(409).json({ error: "Lease is missing, expired, or owned by another worker" });
    return res.json({
      lease_token: leaseToken,
      lease_expires_at: formatSqliteTimestamp(rows[0].lease_expires_at),
      lease_seconds: TASK_LEASE_SECONDS,
    });
  } catch (err) {
    console.error('❌ Renew task error:', err);
    return res.status(500).json({ error: "Database error" });
  }
});

syncRouter.post("/api/done", authenticateToken, requireApiKey, async (req: any, res) => {
  const taskId = Number(req.body?.task_id);
  const deviceId = parseDeviceId(req.body?.device_id);
  const leaseToken = parseLeaseToken(req.body?.lease_token ?? req.body?.token);
  const rawSuccess = req.body?.success;
  if (typeof rawSuccess !== 'boolean') return res.status(400).json({ error: "success must be a boolean" });
  if (req.body?.error != null && typeof req.body.error !== 'string') return res.status(400).json({ error: "error must be a string or null" });
  const errorMessage = req.body?.error || null;
  if (errorMessage && errorMessage.length > MAX_TASK_ERROR_LENGTH) return res.status(400).json({ error: `error must be at most ${MAX_TASK_ERROR_LENGTH} characters` });
  if (!Number.isInteger(taskId) || taskId <= 0) return res.status(400).json({ error: "task_id must be a positive integer" });
  if (!deviceId || !leaseToken) return res.status(400).json({ error: "device_id and lease_token are required" });
  if (!requireBoundDevice(req, res, deviceId)) return;

  const nextStatus = rawSuccess ? 'Done' : 'Failed';
  try {
    const { rows } = await pool.query(
      `UPDATE restore_commands
       SET status = $1, error_message = $2, completed_at = CURRENT_TIMESTAMP,
           lease_expires_at = NULL
       WHERE id = $3 AND user_id = $4 AND device_name = $5 AND status = 'Running'
          AND lease_token = $6
       RETURNING id, status, error_message, completed_at`,
      [nextStatus, errorMessage, taskId, req.user.id, deviceId, leaseToken]
    );
    if (!rows[0]) {
      const existing = await pool.query(
        `SELECT id, status, error_message, completed_at, lease_token FROM restore_commands
         WHERE id = $1 AND user_id = $2 AND device_name = $3`,
        [taskId, req.user.id, deviceId]
      );
      const task = existing.rows[0];
      if (task?.lease_token === leaseToken && task.status === nextStatus && (task.error_message || null) === errorMessage) {
        return res.json({ success: true, task });
      }
      return res.status(409).json({ error: "Lease is missing, expired, rotated, or task is already finished" });
    }
    await writeSyncLog(req.user.id, deviceId, rawSuccess ? 'Success' : 'Error', rawSuccess ? `Task #${taskId} completed` : `Task #${taskId} failed: ${errorMessage || 'Unknown error'}`);
    return res.json({ success: true, task: rows[0] });
  } catch (err) {
    console.error('❌ Complete task error:', err);
    return res.status(500).json({ error: "Database error" });
  }
});

syncRouter.post("/api/sync/push", authenticateToken, upload.single("savefile"), async (req: any, res) => {
  const { gameName, localVersion } = req.body;

  let game = games.find(g => g.gameName === gameName && g.userId === req.user.id);
  if (game) {
    const latest = saves.filter(s => s.gameId === game!.id).sort((a, b) => b.version - a.version)[0];
    if (latest && latest.version > parseInt(localVersion)) {
      return res.status(409).json({ error: "Conflict detected: Server has a newer version", latest });
    }
  }

  res.json({ message: "Sync push success" });
});

syncRouter.post("/api/sync/restore/:gameId", authenticateToken, async (req: any, res) => {
  const gameId = parseInt(req.params.gameId);
  const { maxRetries } = req.body || {};
  const rawDeviceName = req.body?.deviceName;
  const deviceName = rawDeviceName == null || rawDeviceName === '' ? null : parseDeviceId(rawDeviceName);
  const normalizedMaxRetries = Number.isInteger(maxRetries) ? Math.max(0, Math.min(maxRetries, 10)) : 2;

  if (Number.isNaN(gameId)) {
    return res.status(400).json({ error: "Invalid game id" });
  }
  if (rawDeviceName != null && rawDeviceName !== '' && !deviceName) {
    return res.status(400).json({ error: "deviceName must be a non-empty string of at most 255 characters" });
  }

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(`
        SELECT g.id AS game_id, g.game_name, s.id AS save_id, s.version, s.custom_file_path
        FROM games g
        LEFT JOIN saves s ON s.game_id = g.id
        WHERE g.id = $1 AND g.user_id = $2
         ORDER BY (s.version IS NULL) ASC, s.version DESC
        LIMIT 1
      `, [gameId, req.user.id]);

      if (rows.length === 0) {
        return res.status(404).json({ error: "Game not found" });
      }

      const row = rows[0];
      if (!row.save_id) {
        return res.status(400).json({ error: "Game has no save version" });
      }

      const insertRes = await pool.query(
        `INSERT INTO restore_commands (user_id, game_id, save_id, game_name, device_name, save_path, status, max_retries, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'Pending', $7, CURRENT_TIMESTAMP)
         RETURNING id, game_name, save_id, save_path, status, created_at, device_name, retry_count, max_retries`,
        [req.user.id, row.game_id, row.save_id, row.game_name, deviceName || null, row.custom_file_path || null, normalizedMaxRetries]
      );

      return res.json({
        message: "Restore command queued",
        command: insertRes.rows[0],
      });
    } catch (err: any) {
      console.error('❌ Queue restore command error:', err);
      return res.status(500).json({ error: "Database error" });
    }
  }

  const game = games.find(g => g.id === gameId && g.userId === req.user.id);
  if (!game) return res.status(404).json({ error: "Game not found" });

  const latest = saves.filter(s => s.gameId === game.id).sort((a, b) => b.version - a.version)[0];
  if (!latest) return res.status(400).json({ error: "Game has no save version" });

  const command = {
    id: restoreCommandId++,
    userId: req.user.id,
    gameId: game.id,
    saveId: latest.id,
    gameName: game.gameName,
    deviceName: deviceName || null,
    savePath: latest.customFilePath || null,
    status: 'Pending',
    createdAt: new Date().toISOString(),
    claimedAt: null,
    completedAt: null,
    errorMessage: null,
    retryCount: 0,
    maxRetries: normalizedMaxRetries,
  };
  restoreCommands.push(command);

  res.json({
    message: "Restore command queued",
    command,
  });
});

syncRouter.get("/api/sync/commands", authenticateToken, async (req: any, res) => {
  const deviceName = (req.query.deviceName as string | undefined)?.trim();

  if (isUsingDatabase()) {
    try {
      const params: any[] = [req.user.id];
      let whereClause = "WHERE user_id = $1 AND status = 'Pending'";
      if (deviceName) {
        params.push(deviceName);
        whereClause += ` AND (device_name IS NULL OR device_name = $${params.length})`;
      }

      const { rows } = await pool.query(
        `SELECT id, game_id, save_id, game_name, status, device_name, created_at, retry_count, max_retries
         FROM restore_commands
         ${whereClause}
         ORDER BY created_at ASC
         LIMIT 20`,
        params
      );

      res.json(rows.map((r: any) => ({
        id: r.id,
        gameId: r.game_id,
        saveId: r.save_id,
        gameName: r.game_name,
        status: r.status,
        deviceName: r.device_name,
        createdAt: r.created_at,
        retryCount: r.retry_count,
        maxRetries: r.max_retries,
        downloadUrl: saveDownloadUrl(r.save_id),
      })));
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
    return;
  }

  const result = restoreCommands
    .filter(c => c.userId === req.user.id && c.status === 'Pending')
    .filter(c => !deviceName || !c.deviceName || c.deviceName === deviceName)
    .slice(0, 20)
    .map(c => ({
      ...c,
      retryCount: c.retryCount ?? 0,
      maxRetries: c.maxRetries ?? 2,
      downloadUrl: saveDownloadUrl(c.saveId),
    }));

  res.json(result);
});

syncRouter.post("/api/sync/commands/:id/claim", authenticateToken, async (req: any, res) => {
  return res.status(410).json({ error: "Legacy claim endpoint removed; use GET /api/task" });
});

syncRouter.get("/api/sync/restore-status", authenticateToken, async (req: any, res) => {
  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        `SELECT id, game_id, save_id, game_name,
                CASE WHEN status = 'Running' AND (lease_expires_at IS NULL OR lease_expires_at <= CURRENT_TIMESTAMP)
                     THEN 'Timeout' ELSE status END AS display_status,
                device_name, error_message, retry_count, max_retries, created_at, claimed_at,
                lease_expires_at, completed_at
         FROM (
           SELECT rc.*, ROW_NUMBER() OVER (
             PARTITION BY rc.game_id ORDER BY rc.created_at DESC, rc.id DESC
           ) AS rn
           FROM restore_commands rc
           WHERE rc.user_id = $1
         ) ranked_commands
         WHERE rn = 1
         ORDER BY created_at DESC
         LIMIT 200`,
        [req.user.id]
      );

      return res.json(rows.map((r: any) => ({
        id: r.id,
        gameId: r.game_id,
        saveId: r.save_id,
        gameName: r.game_name,
        status: r.display_status,
        deviceName: r.device_name,
        errorMessage: r.error_message,
        retryCount: r.retry_count,
        maxRetries: r.max_retries,
        createdAt: r.created_at,
        claimedAt: r.claimed_at,
        leaseExpiresAt: r.lease_expires_at,
        completedAt: r.completed_at,
      })));
    } catch (err) {
      return res.status(500).json({ error: "Database error" });
    }
  }

  const latestByGame = new Map<number, any>();
  const sorted = [...restoreCommands].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  for (const command of sorted) {
    if (command.userId !== req.user.id) continue;
    if (!latestByGame.has(command.gameId)) {
      latestByGame.set(command.gameId, command);
    }
  }

  res.json(Array.from(latestByGame.values()));
});

syncRouter.post("/api/sync/commands/:id/cancel", authenticateToken, async (req: any, res) => {
  const commandId = parseInt(req.params.id);
  if (Number.isNaN(commandId)) {
    return res.status(400).json({ error: "Invalid command id" });
  }

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        `UPDATE restore_commands
          SET status = 'Cancelled',
              error_message = COALESCE(error_message, 'Cancelled by user'),
              completed_at = NOW(), lease_token = NULL, lease_expires_at = NULL
         WHERE id = $1 AND user_id = $2 AND status IN ('Pending', 'Running')
         RETURNING id, status, error_message, completed_at`,
        [commandId, req.user.id]
      );
      if (rows.length === 0) {
        return res.status(409).json({ error: "Command cannot be cancelled" });
      }
      return res.json({ success: true, command: rows[0] });
    } catch (err) {
      return res.status(500).json({ error: "Database error" });
    }
  }

  const command = restoreCommands.find(c => c.id === commandId && c.userId === req.user.id);
  if (!command) return res.status(404).json({ error: "Command not found" });
  if (command.status !== 'Pending' && command.status !== 'Running') {
    return res.status(409).json({ error: "Command cannot be cancelled" });
  }
  command.status = 'Cancelled';
  command.errorMessage = command.errorMessage || 'Cancelled by user';
  command.completedAt = new Date().toISOString();
  command.leaseToken = null;
  command.leaseExpiresAt = null;
  return res.json({ success: true, command });
});

syncRouter.post("/api/sync/commands/:id/retry", authenticateToken, async (req: any, res) => {
  const commandId = parseInt(req.params.id);
  if (Number.isNaN(commandId)) {
    return res.status(400).json({ error: "Invalid command id" });
  }

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        `UPDATE restore_commands
         SET status = 'Pending',
             error_message = NULL,
              claimed_at = NULL,
              lease_token = NULL,
              lease_expires_at = NULL,
             completed_at = NULL,
             retry_count = retry_count + 1
         WHERE id = $1
           AND user_id = $2
           AND (status IN ('Failed', 'Timeout', 'Cancelled') OR
                (status = 'Running' AND (lease_expires_at IS NULL OR lease_expires_at <= CURRENT_TIMESTAMP)))
           AND retry_count < max_retries
         RETURNING id, status, retry_count, max_retries`,
        [commandId, req.user.id]
      );
      if (rows.length === 0) {
        return res.status(409).json({ error: "Retry limit reached or command not retryable" });
      }
      return res.json({ success: true, command: rows[0] });
    } catch (err) {
      return res.status(500).json({ error: "Database error" });
    }
  }

  const command = restoreCommands.find(c => c.id === commandId && c.userId === req.user.id);
  if (!command) return res.status(404).json({ error: "Command not found" });
  const retryCount = command.retryCount ?? 0;
  const maxRetries = command.maxRetries ?? 2;
  if (!['Failed', 'Timeout', 'Cancelled'].includes(command.status) || retryCount >= maxRetries) {
    return res.status(409).json({ error: "Retry limit reached or command not retryable" });
  }
  command.status = 'Pending';
  command.errorMessage = null;
  command.claimedAt = null;
  command.leaseToken = null;
  command.leaseExpiresAt = null;
  command.completedAt = null;
  command.retryCount = retryCount + 1;
  return res.json({ success: true, command });
});

syncRouter.post("/api/sync/commands/:id/ack", authenticateToken, async (req: any, res) => {
  return res.status(410).json({ error: "Legacy acknowledgement endpoint removed; use POST /api/done" });
});

syncRouter.get("/api/sync/pull", authenticateToken, (req: any, res) => {
  const { gameName } = req.query;
  const game = games.find(g => g.gameName === (gameName as string) && g.userId === req.user.id);
  if (!game) return res.status(404).json({ error: "Game not found" });

  const latest = saves.filter(s => s.gameId === game.id).sort((a, b) => b.version - a.version)[0];
  res.json(latest);
});

// ------------------------------------------------------------------
// Heartbeat endpoints — agent calls POST every poll cycle;
// frontend polls GET to show online/offline indicator per device
// ------------------------------------------------------------------

const HEARTBEAT_ONLINE_MINUTES = 2;

syncRouter.post("/api/sync/heartbeat", authenticateToken, requireApiKey, async (req: any, res) => {
  const deviceName = parseDeviceId(req.body?.deviceName);
  if (!deviceName) {
    return res.status(400).json({ error: "deviceName must be a non-empty string of at most 255 characters" });
  }
  if (!requireBoundDevice(req, res, deviceName)) return;

  if (isUsingDatabase()) {
    try {
      await pool.query(
        `INSERT INTO agent_heartbeats (user_id, device_name, last_seen)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id, device_name) DO UPDATE SET last_seen = NOW()`,
        [req.user.id, deviceName]
      );
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: "Database error" });
    }
  }

  // In-memory mode: no persistent storage needed
  return res.json({ success: true });
});

syncRouter.get("/api/sync/agent-online", authenticateToken, async (req: any, res) => {
  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        `SELECT device_name,
                last_seen,
                last_seen > datetime('now', '-' || $1 || ' minutes') AS online
         FROM agent_heartbeats
         WHERE user_id = $2
         ORDER BY device_name ASC`,
        [HEARTBEAT_ONLINE_MINUTES, req.user.id]
      );
      return res.json(
        rows.map((r: any) => ({
          deviceName: r.device_name,
          lastSeen: r.last_seen,
          online: r.online,
        }))
      );
    } catch (err) {
      return res.status(500).json({ error: "Database error" });
    }
  }

  return res.json([]);
});

export { games, saves };
