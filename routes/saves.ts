import { Router } from "express";
import * as path from "path";
import * as fs from "fs";
import jwt from "jsonwebtoken";
import { pool, isUsingDatabase } from "../config/database.js";
import { JWT_SECRET, PUBLIC_API_ORIGIN } from "../config/environment.js";
import { upload, UPLOADS_DIR_PATH } from "../config/multer.js";
import { authenticateToken } from "../middleware/auth.js";
import { Game, Save } from "../database/types.js";
import { streamFileDownload } from "../utils/download.js";
import { hashFile, sanitizeOriginalFilename } from "../utils/save-artifact.js";

// Mock data (for demo mode)
let games: Game[] = [];
let saves: Save[] = [];
let devices: any[] = [];
let nextId = 2;

export const savesRouter = Router();

const SAVE_DOWNLOAD_TOKEN_TTL = "5m";

function createSaveDownloadUrl(saveId: number) {
  const token = jwt.sign({ purpose: "save-download", saveId }, JWT_SECRET, { expiresIn: SAVE_DOWNLOAD_TOKEN_TTL });
  return `${PUBLIC_API_ORIGIN}/api/save/download-link/${encodeURIComponent(token)}`;
}

savesRouter.post("/api/save/upload", authenticateToken, upload.single("savefile"), async (req: any, res) => {
  const { gameName, deviceName, category, customFilePath } = req.body;
  const file = req.file;

  if (!file) return res.status(400).json({ error: "No file uploaded" });

  const uploadedPath = path.join(UPLOADS_DIR_PATH, file.filename);
  let artifact: Awaited<ReturnType<typeof hashFile>>;
  const originalFilename = sanitizeOriginalFilename(file.originalname);
  try {
    artifact = await hashFile(uploadedPath);
    if (!originalFilename) throw new Error("Invalid original filename");
  } catch (err) {
    await fs.promises.unlink(uploadedPath).catch(() => undefined);
    return res.status(400).json({ error: "Uploaded artifact is invalid: " + (err instanceof Error ? err.message : String(err)) });
  }

  if (isUsingDatabase()) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      let gameRes = await client.query('SELECT id FROM games WHERE user_id = $1 AND game_name = $2', [req.user.id, gameName]);
      let gameId;
      
      if (gameRes.rows.length === 0) {
        const insertRes = await client.query(
          'INSERT INTO games (user_id, game_name, category) VALUES ($1, $2, $3) RETURNING id', 
          [req.user.id, gameName, category || 'Uncategorized']
        );
        gameId = insertRes.rows[0].id;
      } else {
        gameId = gameRes.rows[0].id;
        if (category) {
          await client.query('UPDATE games SET category = $1 WHERE id = $2', [category, gameId]);
        }
      }

      const versionRes = await client.query('SELECT MAX(version) FROM saves WHERE game_id = $1', [gameId]);
      const nextVersion = (versionRes.rows[0].max || 0) + 1;

      // Always persist the uploaded file name for server-side download.
      const storageFilePath = file.filename;
      const quickAccessPath = customFilePath || null;

      const insertSaveRes = await client.query(
        'INSERT INTO saves (game_id, file_path, custom_file_path, version, file_size, sha256, original_filename) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [gameId, storageFilePath, quickAccessPath, nextVersion, artifact.fileSize, artifact.sha256, originalFilename]
      );

      await client.query('COMMIT');
      res.json({ message: "Upload successful", save: insertSaveRes.rows[0] });
    } catch (err) {
      console.error('❌ Upload error:', err);
      await client.query('ROLLBACK');
      await fs.promises.unlink(uploadedPath).catch(() => undefined);
      res.status(500).json({ error: "Upload failed: " + (err instanceof Error ? err.message : String(err)) });
    } finally {
      client.release();
    }
  } else {
    let game = games.find(g => g.gameName === gameName && g.userId === req.user.id);
    if (!game) {
      game = { id: nextId++, userId: req.user.id, gameName, category: category || 'Uncategorized' };
      games.push(game);
    } else if (category) {
      game.category = category;
    }

    const previousSaves = saves.filter(s => s.gameId === game!.id);
    const version = previousSaves.length + 1;

    // Keep real storage path and user quick-access path separate.
    const storageFilePath = file.filename;
    const quickAccessPath = customFilePath || undefined;

    const newSave = {
      id: nextId++,
      gameId: game!.id,
      filePath: storageFilePath,
      customFilePath: quickAccessPath,
      version,
      fileSize: artifact.fileSize,
      sha256: artifact.sha256,
      originalFilename,
      createdAt: new Date().toISOString()
    };
    saves.push(newSave);

    let device = devices.find(d => d.deviceName === deviceName && d.userId === req.user.id);
    if (!device) {
      devices.push({ id: nextId++, userId: req.user.id, deviceName, lastSync: new Date().toISOString() });
    } else {
      device.lastSync = new Date().toISOString();
    }

    res.json({ message: "Upload successful", save: newSave });
  }
});

savesRouter.get("/api/save/list", authenticateToken, async (req: any, res) => {
  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(`
        SELECT g.id, g.game_name, g.category,
                s.id as save_id, s.version, s.file_size, s.sha256, s.original_filename, s.created_at, s.file_path, s.custom_file_path
        FROM games g
        LEFT JOIN (
          SELECT * FROM (
            SELECT saves.*, ROW_NUMBER() OVER (PARTITION BY game_id ORDER BY version DESC, id DESC) AS rn
            FROM saves
          ) ranked_saves WHERE rn = 1
        ) s ON g.id = s.game_id
        WHERE g.user_id = $1
        ORDER BY g.created_at DESC
      `, [req.user.id]);
      
      console.log(`📋 /save/list - Found ${rows.length} games for user ${req.user.id}`);
      
      const result = rows.map(r => {
        const hasSave = !!r.save_id;
        console.log(`  - ${r.game_name}: ${hasSave ? 'HAS save' : 'NO save'}`);
        return {
          id: r.id,
          gameName: r.game_name,
          category: r.category || 'Uncategorized',
          latestSave: r.save_id ? {
            id: r.save_id,
            version: r.version,
            fileSize: Number(r.file_size),
            sha256: r.sha256,
            originalFilename: r.original_filename,
            createdAt: r.created_at,
            filePath: r.custom_file_path || r.file_path,
            savePath: r.custom_file_path || null
          } : undefined,
          versions: r.version || 0
        };
      });
      console.log(`✅ Returning ${result.length} games`);
      res.json(result);
    } catch (err) {
      console.error('❌ Error fetching game list:', err);
      res.status(500).json({ error: "Database error: " + (err instanceof Error ? err.message : String(err)) });
    }
  } else {
    const userGames = games.filter(g => g.userId === req.user.id);
    const result = userGames.map(game => {
      const gameSaves = saves.filter(s => s.gameId === game.id).sort((a, b) => b.version - a.version);
      return {
        ...game,
        latestSave: gameSaves[0] ? {
          ...gameSaves[0],
          savePath: gameSaves[0].customFilePath || null,
        } : undefined,
        versions: gameSaves.length
      };
    });
    res.json(result);
  }
});

savesRouter.get("/api/save/history/:gameId", authenticateToken, async (req: any, res) => {
  const gameId = parseInt(req.params.gameId);
  
  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(`
        SELECT s.id, s.version, s.file_size, s.sha256, s.original_filename, s.created_at, s.file_path, s.custom_file_path
        FROM saves s
        JOIN games g ON s.game_id = g.id
        WHERE g.id = $1 AND g.user_id = $2
        ORDER BY s.version DESC
      `, [gameId, req.user.id]);
      
      res.json(rows.map(r => ({
        id: r.id,
        version: r.version,
        fileSize: Number(r.file_size),
        sha256: r.sha256,
        originalFilename: r.original_filename,
        createdAt: r.created_at,
        filePath: r.custom_file_path || r.file_path,
        savePath: r.custom_file_path || null
      })));
    } catch (err) {
      console.error('❌ Error fetching history:', err);
      res.status(500).json({ error: "Database error" });
    }
  } else {
    const game = games.find(g => g.id === gameId && g.userId === req.user.id);
    if (!game) return res.status(404).json({ error: "Game not found" });

    const history = saves
      .filter(s => s.gameId === gameId)
      .sort((a, b) => b.version - a.version);
    res.json(history);
  }
});

savesRouter.post("/api/save/download/:id/link", authenticateToken, async (req: any, res) => {
  const saveId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(saveId) || saveId <= 0) return res.status(400).json({ error: "Invalid save ID" });

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        `SELECT g.user_id FROM saves s JOIN games g ON s.game_id = g.id WHERE s.id = $1`,
        [saveId]
      );
      if (!rows[0]) return res.status(404).json({ error: `Save #${saveId} không tồn tại` });
      if (rows[0].user_id !== req.user.id && req.user.role !== "Admin") return res.sendStatus(403);
    } catch (err) {
      console.error("Create save download link error:", err);
      return res.status(500).json({ error: "Database error" });
    }
  } else {
    const save = saves.find((item) => item.id === saveId);
    const game = save && games.find((item) => item.id === save.gameId);
    if (!save || !game) return res.status(404).json({ error: "Save not found" });
    if (game.userId !== req.user.id && req.user.role !== "Admin") return res.sendStatus(403);
  }

  return res.json({ downloadUrl: createSaveDownloadUrl(saveId), expiresInSeconds: 300 });
});

savesRouter.get("/api/save/download-link/:token", async (req, res) => {
  let saveId: number;
  try {
    const payload = jwt.verify(req.params.token, JWT_SECRET) as jwt.JwtPayload;
    if (payload.purpose !== "save-download" || !Number.isInteger(payload.saveId)) throw new Error("Invalid download token");
    saveId = payload.saveId;
  } catch {
    return res.status(401).json({ error: "Download link is invalid or expired" });
  }

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(`
        SELECT s.file_path, s.version, g.game_name
        FROM saves s
        JOIN games g ON s.game_id = g.id
        WHERE s.id = $1
      `, [saveId]);
      const save = rows[0];
      if (!save) return res.status(404).json({ error: "Save not found" });

      const filePath = path.join(UPLOADS_DIR_PATH, save.file_path);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Save file not found" });
      return streamFileDownload(res, filePath, `${save.game_name}_v${save.version}${path.extname(save.file_path)}`, {
        cacheControl: "private, no-store",
      });
    } catch (err) {
      console.error("Save download link error:", err);
      return res.status(500).json({ error: "Download failed" });
    }
  }

  const save = saves.find((item) => item.id === saveId);
  const game = save && games.find((item) => item.id === save.gameId);
  if (!save || !game) return res.status(404).json({ error: "Save not found" });
  const filePath = path.join(UPLOADS_DIR_PATH, save.filePath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Save file not found" });
  return streamFileDownload(res, filePath, `${game.gameName}_v${save.version}${path.extname(save.filePath)}`, {
    cacheControl: "private, no-store",
  });
});

savesRouter.get("/api/save/download/:id", authenticateToken, async (req: any, res) => {
  const saveId = parseInt(req.params.id);
  const userId = req.user.id;
  const userRole = req.user.role;
  
  console.log(`📥 Download request: save_id=${saveId}, user_id=${userId}, role=${userRole}`);

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(`
        SELECT s.*, g.game_name, g.user_id 
        FROM saves s 
        JOIN games g ON s.game_id = g.id 
        WHERE s.id = $1
      `, [saveId]);
      
      const save = rows[0];
      if (!save) {
        console.log(`❌ Save ${saveId} not found in database`);
        return res.status(404).json({ error: `Save #${saveId} không tồn tại` });
      }
      
      console.log(`✅ Save found: game="${save.game_name}", owner_id=${save.user_id}, file="${save.file_path}"`);
      
      if (save.user_id !== userId && userRole !== 'Admin') {
        console.log(`❌ Access denied: save owner=${save.user_id}, requester=${userId}`);
        return res.sendStatus(403);
      }
      
      const filePath = path.join(UPLOADS_DIR_PATH, save.file_path);
      console.log(`📂 File path: ${filePath}`);
      
      if (!fs.existsSync(filePath)) {
        console.log(`❌ Physical file not found: ${filePath}`);
        return res.status(404).json({ error: `Tệp upload không tồn tại trên server. Có thể bản ghi cũ đã lưu sai đường dẫn, vui lòng upload lại.` });
      }
      
      const fileName = `${save.game_name}_v${save.version}${path.extname(save.file_path)}`;
      console.log(`✅ Downloading: ${fileName}`);
      return streamFileDownload(res, filePath, fileName);
    } catch (err) {
      console.error('❌ Download database error:', err);
      return res.status(500).json({ error: "Database error" });
    }
  } else {
    const save = saves.find(s => s.id === saveId);
    if (!save) {
      console.log(`❌ Save ${saveId} not found in demo mode`);
      return res.status(404).json({ error: "Save not found" });
    }

    const game = games.find(g => g.id === save.gameId);
    if (!game || (game.userId !== userId && userRole !== 'Admin')) {
      console.log(`❌ Game not found or access denied`);
      return res.sendStatus(403);
    }

    const filePath = path.join(UPLOADS_DIR_PATH, save.filePath);
    return streamFileDownload(res, filePath, `${game.gameName}_v${save.version}${path.extname(save.filePath)}`);
  }
});

savesRouter.put("/api/save/:id", authenticateToken, async (req: any, res) => {
  const saveId = parseInt(req.params.id);
  const { filePath } = req.body;

  if (!filePath) return res.status(400).json({ error: "File path is required" });

  if (isUsingDatabase()) {
    const client = await pool.connect();
    try {
      // Verify the save belongs to the user
      const saveRes = await client.query(`
        SELECT s.id FROM saves s 
        JOIN games g ON s.game_id = g.id 
        WHERE s.id = $1 AND g.user_id = $2
      `, [saveId, req.user.id]);

      if (saveRes.rows.length === 0) {
        return res.status(404).json({ error: "Save not found or unauthorized" });
      }

      const updateRes = await client.query(
        'UPDATE saves SET custom_file_path = $1 WHERE id = $2 RETURNING *',
        [filePath, saveId]
      );

      res.json({ message: "Save updated successfully", save: updateRes.rows[0] });
    } catch (err) {
      console.error('❌ Update error:', err);
      res.status(500).json({ error: "Update failed: " + (err instanceof Error ? err.message : String(err)) });
    } finally {
      client.release();
    }
  } else {
    const save = saves.find(s => s.id === saveId);
    if (!save) return res.status(404).json({ error: "Save not found" });

    const game = games.find(g => g.id === save.gameId);
    if (!game || game.userId !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    save.customFilePath = filePath;
    res.json({ message: "Save updated successfully", save });
  }
});

savesRouter.delete("/api/saves", authenticateToken, async (req: any, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
    : [];
  const uniqueIds = Array.from(new Set(ids));

  if (uniqueIds.length === 0) {
    return res.status(400).json({ error: "ids must be a non-empty array" });
  }

  if (isUsingDatabase()) {
    try {
      const idPlaceholders = uniqueIds.map((_, index) => `$${index + 1}`).join(', ');
      const { rows } = await pool.query(
        `SELECT s.id, s.file_path
         FROM saves s
         JOIN games g ON s.game_id = g.id
         WHERE s.id IN (${idPlaceholders})
           AND (g.user_id = $${uniqueIds.length + 1} OR $${uniqueIds.length + 2} = 'Admin')`,
        [...uniqueIds, req.user.id, req.user.role]
      );

      for (const save of rows) {
        const filePath = path.join(UPLOADS_DIR_PATH, save.file_path);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (err: any) {
            console.warn(`Warning: Could not delete file from disk: ${err.message}`);
          }
        }
      }

      const rowIds = rows.map((row: any) => row.id);
      if (rowIds.length === 0) {
        return res.json({ success: true, deleted: 0 });
      }

      const deletePlaceholders = rowIds.map((_: number, index: number) => `$${index + 1}`).join(', ');
      const deleteResult = await pool.query(`DELETE FROM saves WHERE id IN (${deletePlaceholders})`, rowIds);
      return res.json({ success: true, deleted: deleteResult.rowCount ?? 0 });
    } catch (err: any) {
      console.error('Bulk delete saves error:', err);
      return res.status(500).json({ error: "Failed to delete saves", details: err.message });
    }
  }

  let deleted = 0;
  for (const saveId of uniqueIds) {
    const saveIndex = saves.findIndex(s => s.id === saveId);
    if (saveIndex === -1) continue;
    const save = saves[saveIndex];
    const game = games.find(g => g.id === save.gameId);
    if (!game || (game.userId !== req.user.id && req.user.role !== 'Admin')) continue;
    const filePath = path.join(UPLOADS_DIR_PATH, save.filePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    saves.splice(saveIndex, 1);
    deleted++;
  }

  return res.json({ success: true, deleted });
});

savesRouter.delete("/api/save/:id", authenticateToken, async (req: any, res) => {
  const saveId = parseInt(req.params.id);
  console.log(`🗑️ DELETE /api/save/${saveId} - User:`, req.user?.username || 'unknown');

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(`
        SELECT s.*, g.user_id, s.file_path
        FROM saves s
        JOIN games g ON s.game_id = g.id
        WHERE s.id = $1
      `, [saveId]);

      const save = rows[0];
      console.log(`  DB: Save found:`, save ? 'YES' : 'NO');
      if (!save) return res.status(404).json({ error: "Save not found" });

      console.log(`  DB: Ownership check - save.user_id=${save.user_id}, req.user.id=${req.user.id}, role=${req.user.role}`);
      if (save.user_id !== req.user.id && req.user.role !== 'Admin') {
        console.log(`  DB: Access denied (403)`);
        return res.sendStatus(403);
      }

      // Try to delete file from disk (but continue even if file is missing)
      let fileDeleted = false;
      const filePath = path.join(UPLOADS_DIR_PATH, save.file_path);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`  ✅ File deleted from disk: ${filePath}`);
          fileDeleted = true;
        } catch (err: any) {
          console.warn(`  ⚠️ Warning: Could not delete file from disk: ${err.message}`);
          // Continue anyway - we'll still delete from database
        }
      } else {
        console.log(`  ℹ️ File doesn't exist on disk (already deleted): ${filePath}`);
        // This is OK - file was already deleted manually or by another process
      }

      // Delete from database (must succeed for endpoint to succeed)
      const deleteResult = await pool.query('DELETE FROM saves WHERE id = $1', [saveId]);
      console.log(`  ✅ Deleted from database - rows affected: ${deleteResult.rowCount}`);
      
      res.json({ 
        message: "Save deleted successfully",
        fileDeleted: fileDeleted,
        dbDeleted: deleteResult.rowCount === 1
      });
    } catch (err: any) {
      console.error('❌ Error deleting save:', {
        error: err.message,
        code: err.code,
        saveId: saveId
      });
      res.status(500).json({ 
        error: "Failed to delete save",
        details: err.message 
      });
    }
  } else {
    console.log(`  DEMO: Total saves in memory:`, saves.length);
    const saveIndex = saves.findIndex(s => s.id === saveId);
    console.log(`  DEMO: Save found:`, saveIndex !== -1 ? 'YES' : 'NO');
    if (saveIndex === -1) return res.status(404).json({ error: "Save not found" });

    const save = saves[saveIndex];
    const game = games.find(g => g.id === save.gameId);
    console.log(`  DEMO: Game found:`, game ? 'YES' : 'NO');
    console.log(`  DEMO: Ownership check - game?.userId=${game?.userId}, req.user.id=${req.user.id}`);
    if (!game || game.userId !== req.user.id) {
      console.log(`  DEMO: Access denied (403)`);
      return res.sendStatus(403);
    }

    const filePath = path.join(UPLOADS_DIR_PATH, save.filePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    saves.splice(saveIndex, 1);
    console.log(`  DEMO: Delete complete`);
    res.json({ message: "Save deleted" });
  }
});

export { games, saves, devices, nextId };
