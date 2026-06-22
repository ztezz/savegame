import { Router } from "express";
import { pool, isUsingDatabase } from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";
import { upload } from "../config/multer.js";

// Mock data
let games: any[] = [];
let saves: any[] = [];
let restoreCommands: any[] = [];
let restoreCommandId = 1;

export const syncRouter = Router();
const RUNNING_TIMEOUT_MINUTES = 10;

async function isKnownDeviceForUser(userId: number, deviceId: string): Promise<boolean> {
  if (!deviceId) return false;

  if (isUsingDatabase()) {
    const { rows } = await pool.query(
      `SELECT EXISTS (
         SELECT 1
         FROM (
           SELECT device_name FROM agent_heartbeats WHERE user_id = $1
           UNION
           SELECT device_name FROM restore_commands WHERE user_id = $1
           UNION
           SELECT device_name FROM sync_logs WHERE user_id = $1
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
  if (!isUsingDatabase()) return;

  try {
    await pool.query(
      'INSERT INTO sync_logs (user_id, device_name, status, message) VALUES ($1, $2, $3, $4)',
      [userId, deviceName, status, message]
    );
  } catch (err) {
    console.error('⚠️ Failed to write sync log:', err);
  }
}

syncRouter.get("/api/sync/logs", authenticateToken, async (req: any, res) => {
  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM sync_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
        [req.user.id]
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  } else {
    res.json([]);
  }
});

syncRouter.post("/api/sync/log", authenticateToken, async (req: any, res) => {
  const { deviceName, status, message } = req.body;
  if (isUsingDatabase()) {
    try {
      await pool.query(
        'INSERT INTO sync_logs (user_id, device_name, status, message) VALUES ($1, $2, $3, $4)',
        [req.user.id, deviceName, status, message]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  } else {
    res.json({ success: true });
  }
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
  const deviceId = (req.body?.device_id ?? '').toString().trim();

  if (!Number.isInteger(saveId) || saveId <= 0) {
    return res.status(400).json({ error: "save_id must be a positive integer" });
  }
  if (!deviceId) {
    return res.status(400).json({ error: "device_id is required" });
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
        `INSERT INTO restore_commands (user_id, game_id, save_id, game_name, device_name, save_path, status, retry_count, max_retries)
         VALUES ($1, $2, $3, $4, $5, $6, 'Pending', 0, 2)
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

syncRouter.get("/api/task", authenticateToken, async (req: any, res) => {
  const deviceId = (req.query.device_id ?? '').toString().trim();
  if (!deviceId) {
    return res.status(400).json({ error: "device_id is required" });
  }

  if (isUsingDatabase()) {
    const client = await pool.connect();
    try {
      const knownDevice = await isKnownDeviceForUser(req.user.id, deviceId);
      if (!knownDevice) {
        return res.status(400).json({ error: "Device not found or not registered" });
      }

      await client.query('BEGIN');
      const nextTaskRes = await client.query(
        `SELECT id, game_id, save_id, game_name, device_name, save_path, status, created_at
         FROM restore_commands
         WHERE user_id = $1
           AND status = 'Pending'
           AND device_name = $2
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1`,
        [req.user.id, deviceId]
      );

      if (nextTaskRes.rows.length === 0) {
        await client.query('COMMIT');
        return res.json({ task: null });
      }

      const task = nextTaskRes.rows[0];
      const claimRes = await client.query(
        `UPDATE restore_commands
         SET status = 'Running',
             claimed_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING id, game_id, save_id, game_name, device_name, save_path, status, created_at, claimed_at`,
        [task.id, req.user.id]
      );
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
          file_url: `${req.protocol}://${req.get('host')}/api/save/download/${claimedTask.save_id}`,
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

  const pending = restoreCommands.find(
    (c: any) => c.userId === req.user.id && c.status === 'Pending' && c.deviceName === deviceId
  );

  if (!pending) {
    return res.json({ task: null });
  }

  pending.status = 'Running';
  pending.claimedAt = new Date().toISOString();

  return res.json({
    task: {
      id: pending.id,
      game_id: pending.gameId,
      save_id: pending.saveId,
      game_name: pending.gameName,
      device_id: pending.deviceName,
      status: pending.status,
      created_at: pending.createdAt,
      claimed_at: pending.claimedAt,
      file_url: `${req.protocol}://${req.get('host')}/api/save/download/${pending.saveId}`,
    },
  });
});

syncRouter.post("/api/done", authenticateToken, async (req: any, res) => {
  const taskId = Number(req.body?.task_id);
  const deviceId = (req.body?.device_id ?? '').toString().trim();
  const rawSuccess = req.body?.success;
  if (typeof rawSuccess !== 'boolean') {
    return res.status(400).json({ error: "success must be a boolean" });
  }
  const success = rawSuccess;
  const errorMessage = req.body?.error ? String(req.body.error) : null;

  if (!Number.isInteger(taskId) || taskId <= 0) {
    return res.status(400).json({ error: "task_id must be a positive integer" });
  }
  if (!deviceId) {
    return res.status(400).json({ error: "device_id is required" });
  }

  const nextStatus = success ? 'Done' : 'Failed';

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        `UPDATE restore_commands
         SET status = $1,
             error_message = $2,
             completed_at = NOW(),
             claimed_at = COALESCE(claimed_at, NOW())
         WHERE id = $3
           AND user_id = $4
           AND device_name = $5
           AND status IN ('Pending', 'Running')
         RETURNING id, status, error_message, completed_at`,
        [nextStatus, errorMessage, taskId, req.user.id, deviceId]
      );

      if (rows.length === 0) {
        return res.status(409).json({ error: "Task not found, already finished, or device mismatch" });
      }

      await writeSyncLog(
        req.user.id,
        deviceId,
        success ? 'Success' : 'Error',
        success ? `Task #${taskId} completed` : `Task #${taskId} failed: ${errorMessage || 'Unknown error'}`
      );

      return res.json({ success: true, task: rows[0] });
    } catch (err) {
      console.error('❌ Complete task error:', err);
      return res.status(500).json({ error: "Database error" });
    }
  }

  const task = restoreCommands.find((c: any) => c.id === taskId && c.userId === req.user.id && c.deviceName === deviceId);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  if (task.status !== 'Pending' && task.status !== 'Running') {
    return res.status(409).json({ error: "Task is already finished" });
  }

  task.status = nextStatus;
  task.errorMessage = errorMessage;
  task.completedAt = new Date().toISOString();
  task.claimedAt = task.claimedAt || new Date().toISOString();
  return res.json({ success: true, task });
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
  const { deviceName, maxRetries } = req.body || {};
  const normalizedMaxRetries = Number.isInteger(maxRetries) ? Math.max(0, Math.min(maxRetries, 10)) : 2;

  if (Number.isNaN(gameId)) {
    return res.status(400).json({ error: "Invalid game id" });
  }

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(`
        SELECT g.id AS game_id, g.game_name, s.id AS save_id, s.version
        FROM games g
        LEFT JOIN saves s ON s.game_id = g.id
        WHERE g.id = $1 AND g.user_id = $2
        ORDER BY s.version DESC NULLS LAST
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
        `INSERT INTO restore_commands (user_id, game_id, save_id, game_name, device_name, status, max_retries)
         VALUES ($1, $2, $3, $4, $5, 'Pending', $6)
         RETURNING id, game_name, save_id, status, created_at, device_name, retry_count, max_retries`,
        [req.user.id, row.game_id, row.save_id, row.game_name, deviceName || null, normalizedMaxRetries]
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
        downloadUrl: `${req.protocol}://${req.get('host')}/api/save/download/${r.save_id}`,
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
      downloadUrl: `${req.protocol}://${req.get('host')}/api/save/download/${c.saveId}`,
    }));

  res.json(result);
});

syncRouter.post("/api/sync/commands/:id/claim", authenticateToken, async (req: any, res) => {
  const commandId = parseInt(req.params.id);
  const deviceName = (req.body?.deviceName as string | undefined)?.trim();

  if (Number.isNaN(commandId)) {
    return res.status(400).json({ error: "Invalid command id" });
  }

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        `UPDATE restore_commands
         SET status = 'Running',
             claimed_at = COALESCE(claimed_at, NOW())
         WHERE id = $1
           AND user_id = $2
           AND status = 'Pending'
           AND ($3::text IS NULL OR device_name IS NULL OR device_name = $3)
         RETURNING id, game_id, save_id, game_name, status, claimed_at, retry_count, max_retries`,
        [commandId, req.user.id, deviceName || null]
      );

      if (rows.length === 0) {
        return res.status(409).json({ error: "Command is not pending, not found, or device mismatch" });
      }

      return res.json({ success: true, command: rows[0] });
    } catch (err) {
      return res.status(500).json({ error: "Database error" });
    }
  }

  const command = restoreCommands.find(c => c.id === commandId && c.userId === req.user.id);
  if (!command) return res.status(404).json({ error: "Command not found" });
  if (command.status !== 'Pending') {
    return res.status(409).json({ error: "Command is not pending" });
  }
  if (deviceName && command.deviceName && command.deviceName !== deviceName) {
    return res.status(409).json({ error: "Command device mismatch" });
  }

  command.status = 'Running';
  command.claimedAt = command.claimedAt || new Date().toISOString();
  return res.json({ success: true, command });
});

syncRouter.get("/api/sync/restore-status", authenticateToken, async (req: any, res) => {
  if (isUsingDatabase()) {
    try {
      await pool.query(
        `UPDATE restore_commands
         SET status = 'Timeout',
             error_message = COALESCE(error_message, 'Command timed out'),
             completed_at = NOW()
         WHERE user_id = $1
           AND status = 'Running'
           AND claimed_at < NOW() - ($2 || ' minutes')::interval`,
        [req.user.id, RUNNING_TIMEOUT_MINUTES]
      );

      const { rows } = await pool.query(
        `SELECT DISTINCT ON (rc.game_id)
            rc.id,
            rc.game_id,
            rc.save_id,
            rc.game_name,
            rc.status,
            rc.device_name,
            rc.error_message,
            rc.retry_count,
            rc.max_retries,
            rc.created_at,
            rc.claimed_at,
            rc.completed_at
         FROM restore_commands rc
         WHERE rc.user_id = $1
         ORDER BY rc.game_id, rc.created_at DESC
         LIMIT 200`,
        [req.user.id]
      );

      return res.json(rows.map((r: any) => ({
        id: r.id,
        gameId: r.game_id,
        saveId: r.save_id,
        gameName: r.game_name,
        status: r.status,
        deviceName: r.device_name,
        errorMessage: r.error_message,
        retryCount: r.retry_count,
        maxRetries: r.max_retries,
        createdAt: r.created_at,
        claimedAt: r.claimed_at,
        completedAt: r.completed_at,
      })));
    } catch (err) {
      return res.status(500).json({ error: "Database error" });
    }
  }

  const now = Date.now();
  restoreCommands.forEach((command) => {
    if (
      command.userId === req.user.id &&
      command.status === 'Running' &&
      command.claimedAt &&
      now - new Date(command.claimedAt).getTime() > RUNNING_TIMEOUT_MINUTES * 60 * 1000
    ) {
      command.status = 'Timeout';
      command.errorMessage = command.errorMessage || 'Command timed out';
      command.completedAt = new Date().toISOString();
    }
  });

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
             completed_at = NOW()
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
             completed_at = NULL,
             retry_count = retry_count + 1
         WHERE id = $1
           AND user_id = $2
           AND status IN ('Failed', 'Timeout', 'Cancelled')
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
  command.completedAt = null;
  command.retryCount = retryCount + 1;
  return res.json({ success: true, command });
});

syncRouter.post("/api/sync/commands/:id/ack", authenticateToken, async (req: any, res) => {
  const commandId = parseInt(req.params.id);
  const { status, errorMessage } = req.body || {};

  if (Number.isNaN(commandId)) {
    return res.status(400).json({ error: "Invalid command id" });
  }

  const allowedStatuses = ['Done', 'Failed', 'Timeout', 'Cancelled'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "status must be Done, Failed, Timeout, or Cancelled" });
  }

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        `UPDATE restore_commands
         SET status = $1,
             error_message = $2,
             claimed_at = COALESCE(claimed_at, NOW()),
             completed_at = NOW()
         WHERE id = $3 AND user_id = $4 AND status IN ('Pending', 'Running')
         RETURNING id, status, error_message, completed_at`,
        [status, errorMessage || null, commandId, req.user.id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "Command not found" });
      }

      return res.json({ success: true, command: rows[0] });
    } catch (err) {
      return res.status(500).json({ error: "Database error" });
    }
  }

  const command = restoreCommands.find(c => c.id === commandId && c.userId === req.user.id);
  if (!command) return res.status(404).json({ error: "Command not found" });
  if (command.status !== 'Pending' && command.status !== 'Running') {
    return res.status(409).json({ error: "Command is already finished" });
  }

  command.status = status;
  command.errorMessage = errorMessage || null;
  command.claimedAt = command.claimedAt || new Date().toISOString();
  command.completedAt = new Date().toISOString();

  res.json({ success: true, command });
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

syncRouter.post("/api/sync/heartbeat", authenticateToken, async (req: any, res) => {
  const deviceName = (req.body?.deviceName ?? "").toString().trim();
  if (!deviceName) {
    return res.status(400).json({ error: "deviceName is required" });
  }

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
                (NOW() - last_seen) < ($1 * INTERVAL '1 minute') AS online
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
