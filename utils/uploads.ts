import * as fs from "node:fs";
import * as path from "node:path";
import { UPLOADS_DIR_PATH } from "../config/multer.js";
import { UploadSession } from "../database/types.js";

const TEMP_UPLOADS_DIR = path.join(UPLOADS_DIR_PATH, ".temp");
fs.mkdirSync(TEMP_UPLOADS_DIR, { recursive: true });

export const uploadSessions = new Map<string, UploadSession>();
export const getTempUploadDir = () => TEMP_UPLOADS_DIR;

export async function writeUploadChunk(session: UploadSession, chunkIndex: number, totalChunks: number, data: Buffer) {
  const expectedChunks = Math.ceil(session.totalSize / session.chunkSize);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || totalChunks !== expectedChunks || chunkIndex >= expectedChunks) {
    throw Object.assign(new Error("Invalid chunk metadata"), { status: 400 });
  }
  const expectedSize = chunkIndex === expectedChunks - 1
    ? session.totalSize - chunkIndex * session.chunkSize
    : session.chunkSize;
  if (data.length !== expectedSize) {
    throw Object.assign(new Error(`Invalid chunk size: received ${data.length}, expected ${expectedSize}`), { status: 400 });
  }

  const handle = await fs.promises.open(session.tempFilePath, "r+");
  try {
    let written = 0;
    const position = chunkIndex * session.chunkSize;
    while (written < data.length) {
      const result = await handle.write(data, written, data.length - written, position + written);
      written += result.bytesWritten;
    }
  } finally {
    await handle.close();
  }
  session.receivedChunks.add(chunkIndex);
}

export function assertUploadComplete(session: UploadSession) {
  const expectedChunks = Math.ceil(session.totalSize / session.chunkSize);
  const size = fs.existsSync(session.tempFilePath) ? fs.statSync(session.tempFilePath).size : 0;
  if (session.receivedChunks.size !== expectedChunks || size !== session.totalSize) {
    throw Object.assign(new Error(`Upload incomplete: received ${size} of ${session.totalSize} bytes`), { status: 400 });
  }
}

export function removeUploadSession(sessionId: string) {
  const session = uploadSessions.get(sessionId);
  if (session?.tempFilePath && fs.existsSync(session.tempFilePath)) fs.unlinkSync(session.tempFilePath);
  uploadSessions.delete(sessionId);
}

export function startUploadSessionCleanupInterval() {
  setInterval(() => {
    const expiredBefore = Date.now() - 24 * 60 * 60 * 1000;
    for (const [sessionId, session] of uploadSessions) {
      if (session.createdAt < expiredBefore) removeUploadSession(sessionId);
    }
  }, 60 * 60 * 1000).unref();
}
