import * as fs from "fs";
import * as path from "path";
import { UploadSession } from "../database/types.js";
import { UPLOADS_DIR_PATH } from "../config/multer.js";

const TEMP_UPLOADS_DIR = path.join(UPLOADS_DIR_PATH, '.temp');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_UPLOADS_DIR)) {
  fs.mkdirSync(TEMP_UPLOADS_DIR, { recursive: true });
}

export const uploadSessions = new Map<string, UploadSession>();

export function startUploadSessionCleanupInterval() {
  setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of uploadSessions) {
      if (now - session.createdAt > 24 * 60 * 60 * 1000) {
        // Clean up temp files
        const tempPaths = new Set(session.chunks.map((chunk) => chunk.path));
        if (session.tempFilePath) tempPaths.add(session.tempFilePath);
        tempPaths.forEach((tempPath) => {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        });
        uploadSessions.delete(sessionId);
        console.log(`🧹 Cleaned up old upload session: ${sessionId}`);
      }
    }
  }, 60 * 60 * 1000); // Check every hour
}

export function getTempUploadDir() {
  return TEMP_UPLOADS_DIR;
}
