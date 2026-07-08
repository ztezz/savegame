import { Router } from "express";
import express from "express";
import * as path from "path";
import * as fs from "fs";
import { pool, isUsingDatabase } from "../config/database.js";
import { upload, UPLOADS_DIR_PATH } from "../config/multer.js";
import { authenticateToken, isAdmin } from "../middleware/auth.js";
import { uploadSessions, getTempUploadDir } from "../utils/uploads.js";
import { UploadSession } from "../database/types.js";
import { streamFileDownload } from "../utils/download.js";

const TEMP_UPLOADS_DIR = getTempUploadDir();

export const activationRouter = Router();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function insertActivationFileWithRetry(values: any[]) {
  let lastErr: any;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await pool.query(
        'INSERT INTO activation_files (user_id, game_name, original_name, file_path, file_size, note) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        values
      );
    } catch (err: any) {
      lastErr = err;
      console.warn(`⚠️ Insert activation file failed (attempt ${attempt}/3):`, err?.message || err);
      if (attempt < 3) await sleep(attempt * 1500);
    }
  }
  throw lastErr;
}

// Chunked Upload
activationRouter.post("/api/activation/upload/init", authenticateToken, isAdmin, express.json({ limit: '1mb' }), async (req: any, res) => {
  const { fileName, fileSize, gameName, note } = req.body;
  if (!fileName || fileSize <= 0) {
    return res.status(400).json({ error: "Invalid fileName or fileSize" });
  }

  const sessionId = `${req.user.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const session: UploadSession = {
    sessionId,
    userId: req.user.id,
    fileName,
    totalSize: fileSize,
    chunks: [],
    gameName,
    note: note || '',
    createdAt: Date.now()
  };
  uploadSessions.set(sessionId, session);
  console.log(`📝 Upload session created: ${sessionId} (${(fileSize / (1024 * 1024)).toFixed(1)}MB)`);
  res.json({ sessionId, chunkSize: 20 * 1024 * 1024 }); // 20MB chunks
});

activationRouter.post("/api/activation/upload/chunk", authenticateToken, isAdmin, express.raw({ type: 'application/octet-stream', limit: '100mb' }), async (req: any, res) => {
  const { sessionId, chunkIndex, totalChunks } = req.query;
  const session = uploadSessions.get(sessionId as string);
  
  if (!session || session.userId !== req.user.id) {
    return res.status(404).json({ error: "Upload session not found" });
  }

  try {
    const chunkPath = path.join(TEMP_UPLOADS_DIR, `${sessionId}_chunk_${chunkIndex}`);
    fs.writeFileSync(chunkPath, req.body as Buffer);
    
    session.chunks.push({ index: parseInt(chunkIndex as string), path: chunkPath });
    console.log(`📥 Chunk ${chunkIndex}/${totalChunks} received (${(req.body.length / (1024 * 1024)).toFixed(1)}MB)`);
    
    res.json({ 
      success: true, 
      chunkIndex, 
      totalChunks,
      received: session.chunks.length 
    });
  } catch (err) {
    console.error('❌ Chunk save error:', err);
    res.status(500).json({ error: "Failed to save chunk" });
  }
});

activationRouter.post("/api/activation/upload/finalize", authenticateToken, isAdmin, express.json({ limit: '1mb' }), async (req: any, res) => {
  const { sessionId } = req.body;
  const session = uploadSessions.get(sessionId);
  
  if (!session || session.userId !== req.user.id) {
    return res.status(404).json({ error: "Upload session not found" });
  }

  try {
    // Sort chunks by index and merge
    session.chunks.sort((a, b) => a.index - b.index);
    const finalPath = path.join(UPLOADS_DIR_PATH, `activation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.bin`);
    
    const writeStream = fs.createWriteStream(finalPath);
    for (const chunk of session.chunks) {
      const data = fs.readFileSync(chunk.path);
      writeStream.write(data);
      fs.unlinkSync(chunk.path); // Delete chunk after writing
    }
    writeStream.end();

    // Wait for stream to finish
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
    });

    // Get final file size
    const fileStats = fs.statSync(finalPath);
    const fileName = path.basename(finalPath);

    // Save to database
    if (isUsingDatabase()) {
      try {
        const { rows } = await insertActivationFileWithRetry([req.user.id, session.gameName, session.fileName, fileName, fileStats.size, session.note]);
        uploadSessions.delete(sessionId);
        console.log(`✅ Upload finalized: ${session.fileName} (${(fileStats.size / (1024 * 1024)).toFixed(1)}MB)`);
        res.status(201).json(rows[0]);
      } catch (dbErr: any) {
        fs.unlinkSync(finalPath);
        throw dbErr;
      }
    } else {
      uploadSessions.delete(sessionId);
      res.status(201).json({ success: true, message: "Upload finalized" });
    }
  } catch (err) {
    console.error('❌ Upload finalization error:', err);
    res.status(500).json({ error: "Failed to finalize upload: " + (err instanceof Error ? err.message : String(err)) });
  }
});

// Single file upload
activationRouter.post("/api/activation/upload", authenticateToken, isAdmin, upload.single("activationfile"), async (req: any, res) => {
  const { gameName, note } = req.body;
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  if (isUsingDatabase()) {
    try {
      const { rows } = await insertActivationFileWithRetry([req.user.id, gameName, file.originalname, file.filename, file.size, note || '']);
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error('❌ Upload activation file error:', err);
      res.status(500).json({ error: "Upload failed: " + (err instanceof Error ? err.message : String(err)) });
    }
  } else {
    res.status(201).json({ success: true, message: "Upload successful" });
  }
});

// List activation files
activationRouter.get("/api/activation/list", authenticateToken, async (req: any, res) => {
  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM activation_files ORDER BY created_at DESC'
      );
      res.json(rows.map(r => ({
        id: r.id,
        gameName: r.game_name,
        originalName: r.original_name,
        fileSize: Number(r.file_size),
        note: r.note,
        createdAt: r.created_at
      })));
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  } else {
    res.json([]);
  }
});

// Download activation file
activationRouter.get("/api/activation/download/:id", authenticateToken, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM activation_files WHERE id = $1',
        [id]
      );
      const record = rows[0];
      if (!record) return res.status(404).json({ error: "File not found" });
      const filePath = path.join(UPLOADS_DIR_PATH, record.file_path);
      return streamFileDownload(res, filePath, record.original_name);
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

// Delete activation file
activationRouter.delete("/api/activation/:id", authenticateToken, isAdmin, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM activation_files WHERE id = $1',
        [id]
      );
      const record = rows[0];
      if (!record) return res.status(404).json({ error: "File not found" });

      const filePath = path.join(UPLOADS_DIR_PATH, record.file_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      await pool.query('DELETE FROM activation_files WHERE id = $1', [id]);
      res.json({ message: "Deleted" });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

// Update activation file
activationRouter.put("/api/activation/:id", authenticateToken, isAdmin, async (req: any, res) => {
  const id = parseInt(req.params.id);
  const { gameName, note } = req.body;

  if (!gameName || gameName.trim() === '') {
    return res.status(400).json({ error: "Game name is required" });
  }

  if (isUsingDatabase()) {
    try {
      const checkQuery = await pool.query(
        'SELECT * FROM activation_files WHERE id = $1',
        [id]
      );
      if (checkQuery.rows.length === 0) {
        return res.status(404).json({ error: "File not found" });
      }

      await pool.query(
        'UPDATE activation_files SET game_name = $1, note = $2 WHERE id = $3',
        [gameName.trim(), note || '', id]
      );
      res.json({ message: "Updated successfully" });
    } catch (err) {
      console.error('❌ Update activation file error:', err);
      res.status(500).json({ error: "Database error" });
    }
  } else {
    res.status(404).json({ error: "File not found" });
  }
});
